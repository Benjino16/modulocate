import { eq } from "drizzle-orm";
import type {
  AllocationCategory,
  AllocationGroup,
  AllocationInput,
  AllocationIssue,
  AllocationModule,
  AllocationRule,
  AllocationStudent,
  AllocationSubRule,
  CategoryId,
  DateId,
  GroupId,
  ModuleId,
  RuleId,
  StudentId,
  SubRuleId,
} from "@modulocate/allocation-engine";
import type { DbExecutor } from "./client";
import { resolveStudentEligibility } from "./eligibility";
import {
  categoryInSubRule,
  moduleCategories,
  moduleInCategory,
  moduleInDate,
  modules,
  rules,
  studentGroups,
  studentInGroup,
  studentPreferences,
  students,
  subRules,
} from "./schema";

export interface AssembledAllocationInput {
  input: AllocationInput;
  // Students with no effective rule (neither their own nor their group's) —
  // the engine requires every AllocationStudent to resolve to a rule
  // (packages/allocation-engine/src/types.ts's AllocationStudent.ruleId
  // comment), and there is no per-project default-rule mechanism yet
  // (planning.md Section 6). These students are excluded from the engine run
  // and reported as issues instead, so one misconfigured student doesn't
  // abort the whole run.
  preIssues: AllocationIssue[];
}

// Assembles a fresh AllocationInput straight from current DB state — no
// frozen snapshot, matches planning.md "Locked Decision: Live Resolution
// Instead of Frozen State". The worker calls this immediately before every
// allocate() run, including re-runs, never caching it across runs.
export async function assembleAllocationInput(
  executor: DbExecutor,
  projectId: string,
): Promise<AssembledAllocationInput> {
  const [
    ruleRows,
    subRuleRows,
    categoryInSubRuleRows,
    moduleRows,
    moduleCategoryRows,
    moduleDateRows,
    categoryRows,
    groupRows,
    groupMembershipRows,
    studentRows,
    preferenceRows,
    eligibility,
  ] = await Promise.all([
    executor.select().from(rules).where(eq(rules.projectId, projectId)),
    executor.select().from(subRules).where(eq(subRules.projectId, projectId)),
    executor.select().from(categoryInSubRule).where(eq(categoryInSubRule.projectId, projectId)),
    executor.select().from(modules).where(eq(modules.projectId, projectId)),
    executor.select().from(moduleInCategory).where(eq(moduleInCategory.projectId, projectId)),
    executor.select().from(moduleInDate).where(eq(moduleInDate.projectId, projectId)),
    executor.select().from(moduleCategories).where(eq(moduleCategories.projectId, projectId)),
    executor.select().from(studentGroups).where(eq(studentGroups.projectId, projectId)),
    executor.select().from(studentInGroup).where(eq(studentInGroup.projectId, projectId)),
    executor.select().from(students).where(eq(students.projectId, projectId)),
    executor.select().from(studentPreferences).where(eq(studentPreferences.projectId, projectId)),
    resolveStudentEligibility(executor, { projectId }),
  ]);

  const categoryIdsBySubRule = new Map<string, CategoryId[]>();
  for (const row of categoryInSubRuleRows) {
    const list = categoryIdsBySubRule.get(row.subRuleId) ?? [];
    list.push(row.categoryId as CategoryId);
    categoryIdsBySubRule.set(row.subRuleId, list);
  }

  const subRulesByRule = new Map<string, AllocationSubRule[]>();
  for (const subRule of subRuleRows) {
    const list = subRulesByRule.get(subRule.ruleId) ?? [];
    list.push({ id: subRule.id as SubRuleId, categoryIds: categoryIdsBySubRule.get(subRule.id) ?? [] });
    subRulesByRule.set(subRule.ruleId, list);
  }

  const allocationRules: AllocationRule[] = ruleRows.map((rule) => ({
    id: rule.id as RuleId,
    moduleCount: rule.moduleCount,
    priority: rule.priority,
    subRules: subRulesByRule.get(rule.id) ?? [],
  }));

  const categoryIdsByModule = new Map<string, CategoryId[]>();
  for (const row of moduleCategoryRows) {
    const list = categoryIdsByModule.get(row.moduleId) ?? [];
    list.push(row.categoryId as CategoryId);
    categoryIdsByModule.set(row.moduleId, list);
  }
  const dateIdsByModule = new Map<string, DateId[]>();
  for (const row of moduleDateRows) {
    const list = dateIdsByModule.get(row.moduleId) ?? [];
    list.push(row.dateId as DateId);
    dateIdsByModule.set(row.moduleId, list);
  }

  const allocationModules: AllocationModule[] = moduleRows.map((module) => ({
    id: module.id as ModuleId,
    min: module.min,
    max: module.max,
    categoryIds: categoryIdsByModule.get(module.id) ?? [],
    dateIds: dateIdsByModule.get(module.id) ?? [],
  }));

  const allocationCategories: AllocationCategory[] = categoryRows.map((category) => ({
    id: category.id as CategoryId,
  }));

  // One group per student ("Klasse") — same simplifying assumption
  // apps/backend/src/routers/students.ts's loadStudents and this file's
  // resolveStudentEligibility already make; student_in_group is schema-wise
  // many-to-many but never populated with more than one row per student.
  const groupIdByStudent = new Map<string, string>();
  const studentIdsByGroup = new Map<string, StudentId[]>();
  for (const row of groupMembershipRows) {
    groupIdByStudent.set(row.studentId, row.groupId);
    const list = studentIdsByGroup.get(row.groupId) ?? [];
    list.push(row.studentId as StudentId);
    studentIdsByGroup.set(row.groupId, list);
  }

  const allocationGroups: AllocationGroup[] = groupRows.map((group) => ({
    id: group.id as GroupId,
    studentIds: studentIdsByGroup.get(group.id) ?? [],
  }));

  const groupRuleById = new Map(groupRows.map((group) => [group.id, group.ruleId]));
  const preferencesByStudent = new Map<string, { moduleId: ModuleId; rank: number }[]>();
  for (const row of preferenceRows) {
    const list = preferencesByStudent.get(row.studentId) ?? [];
    list.push({ moduleId: row.moduleId as ModuleId, rank: row.preference });
    preferencesByStudent.set(row.studentId, list);
  }
  const eligibleModuleIdsByStudent = new Map(eligibility.map((e) => [e.studentId, e.eligibleModuleIds]));

  const allocationStudents: AllocationStudent[] = [];
  const preIssues: AllocationIssue[] = [];

  for (const student of studentRows) {
    const groupId = groupIdByStudent.get(student.id);
    const effectiveRuleId = student.ruleId ?? (groupId ? (groupRuleById.get(groupId) ?? null) : null);
    if (!effectiveRuleId) {
      preIssues.push({
        type: "unassigned",
        studentId: student.id as StudentId,
        detail: "Kein Regelwerk zugewiesen (weder Schüler:in noch Gruppe).",
      });
      continue;
    }
    allocationStudents.push({
      id: student.id as StudentId,
      groupIds: groupId ? [groupId as GroupId] : [],
      ruleId: effectiveRuleId as RuleId,
      preferences: preferencesByStudent.get(student.id) ?? [],
      eligibleModuleIds: (eligibleModuleIdsByStudent.get(student.id) ?? []) as ModuleId[],
    });
  }

  return {
    input: {
      students: allocationStudents,
      modules: allocationModules,
      categories: allocationCategories,
      groups: allocationGroups,
      rules: allocationRules,
    },
    preIssues,
  };
}
