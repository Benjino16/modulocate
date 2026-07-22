import { eq } from "drizzle-orm";
import { evaluateRuleFulfillment } from "@modulocate/allocation-engine";
import type {
  AllocationModule,
  AllocationRule,
  AllocationSubRule,
  CategoryId,
  ModuleId,
  RuleId,
  SubRuleId,
} from "@modulocate/allocation-engine";
import type { DbExecutor } from "./client";
import {
  rules,
  subRules,
  categoryInSubRule,
  moduleCategories,
  moduleInCategory,
  students,
  studentGroups,
  studentInGroup,
  studentInModule,
} from "./schema";

export interface StudentRuleCompliance {
  studentId: string;
  ruleId: string;
  ruleName: string;
  moduleCountTarget: number;
  moduleCountAssigned: number;
  moduleCountSatisfied: boolean;
  subRulesSatisfied: boolean;
  // Union of missing-category names across every unsatisfied sub-rule — for a
  // tooltip, not a per-sub-rule breakdown (the admin roster view just needs
  // "why is this red", not the full evaluateRuleFulfillment shape).
  missingCategoryNames: string[];
}

// Checks each student's *currently assigned* modules (student_in_module)
// against their effective rule via allocation-engine's evaluateRuleFulfillment
// — the same exact-search admin-review check described in
// planning.md Phase 4, just fed from live assignment state rather than a
// hypothetical set. Students with no effective rule are omitted entirely;
// there is nothing to check them against (same as assembleAllocationInput's
// preIssues handling of the same case).
export async function resolveRuleCompliance(
  executor: DbExecutor,
  { projectId }: { projectId: string },
): Promise<StudentRuleCompliance[]> {
  const [
    ruleRows,
    subRuleRows,
    categoryInSubRuleRows,
    categoryRows,
    moduleCategoryRows,
    studentRows,
    groupMembershipRows,
    groupRows,
    assignmentRows,
  ] = await Promise.all([
    executor.select().from(rules).where(eq(rules.projectId, projectId)),
    executor.select().from(subRules).where(eq(subRules.projectId, projectId)),
    executor.select().from(categoryInSubRule).where(eq(categoryInSubRule.projectId, projectId)),
    executor.select().from(moduleCategories).where(eq(moduleCategories.projectId, projectId)),
    executor.select().from(moduleInCategory).where(eq(moduleInCategory.projectId, projectId)),
    executor
      .select({ id: students.id, ruleId: students.ruleId })
      .from(students)
      .where(eq(students.projectId, projectId)),
    executor.select().from(studentInGroup).where(eq(studentInGroup.projectId, projectId)),
    executor
      .select({ id: studentGroups.id, ruleId: studentGroups.ruleId })
      .from(studentGroups)
      .where(eq(studentGroups.projectId, projectId)),
    executor.select().from(studentInModule).where(eq(studentInModule.projectId, projectId)),
  ]);

  if (studentRows.length === 0 || ruleRows.length === 0) return [];

  const categoryNameById = new Map(categoryRows.map((c) => [c.id, c.name]));

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

  const ruleById = new Map<string, { rule: AllocationRule; name: string }>();
  for (const row of ruleRows) {
    ruleById.set(row.id, {
      rule: {
        id: row.id as RuleId,
        moduleCount: row.moduleCount,
        priority: row.priority,
        subRules: subRulesByRule.get(row.id) ?? [],
      },
      name: row.name,
    });
  }

  const groupRuleById = new Map(groupRows.map((g) => [g.id, g.ruleId]));
  const groupIdByStudent = new Map(groupMembershipRows.map((m) => [m.studentId, m.groupId]));

  const categoryIdsByModule = new Map<string, CategoryId[]>();
  for (const row of moduleCategoryRows) {
    const list = categoryIdsByModule.get(row.moduleId) ?? [];
    list.push(row.categoryId as CategoryId);
    categoryIdsByModule.set(row.moduleId, list);
  }

  const assignedModuleIdsByStudent = new Map<string, string[]>();
  for (const row of assignmentRows) {
    const list = assignedModuleIdsByStudent.get(row.studentId) ?? [];
    list.push(row.moduleId);
    assignedModuleIdsByStudent.set(row.studentId, list);
  }

  const results: StudentRuleCompliance[] = [];
  for (const student of studentRows) {
    const groupId = groupIdByStudent.get(student.id);
    const effectiveRuleId = student.ruleId ?? (groupId ? (groupRuleById.get(groupId) ?? null) : null);
    if (!effectiveRuleId) continue;

    const entry = ruleById.get(effectiveRuleId);
    if (!entry) continue;

    const assignedModules: AllocationModule[] = (assignedModuleIdsByStudent.get(student.id) ?? []).map(
      (moduleId) => ({
        id: moduleId as ModuleId,
        min: 0,
        max: 0,
        categoryIds: categoryIdsByModule.get(moduleId) ?? [],
        dateIds: [],
      }),
    );

    const evaluation = evaluateRuleFulfillment(assignedModules, entry.rule);
    const unsatisfiedSubRules = evaluation.subRules.filter((sr) => !sr.satisfied);
    const missingCategoryNames = [
      ...new Set(
        unsatisfiedSubRules.flatMap((sr) => sr.missingCategoryIds.map((c) => categoryNameById.get(c) ?? c)),
      ),
    ];

    results.push({
      studentId: student.id,
      ruleId: effectiveRuleId,
      ruleName: entry.name,
      moduleCountTarget: evaluation.moduleCountTarget,
      moduleCountAssigned: evaluation.moduleCountAssigned,
      moduleCountSatisfied: evaluation.moduleCountSatisfied,
      subRulesSatisfied: unsatisfiedSubRules.length === 0,
      missingCategoryNames,
    });
  }

  return results;
}
