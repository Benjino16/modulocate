import { and, eq, inArray } from "drizzle-orm";
import type { DbExecutor } from "./client";
import {
  students,
  studentGroups,
  studentInGroup,
  modules,
  moduleInCategory,
  moduleInDate,
  categoryIncludesCategory,
  ruleBlockedCategory,
  ruleBlockedModule,
  ruleBlockedDate,
} from "./schema";

// Shared by both apps/backend (vote route, live per-request) and apps/worker
// (AllocationInput assembly, bulk before a run) — see planning.md "Deferred
// Decision: Live Resolution for the Vote App" and "Locked Decision: Blocking
// Lives on the Rule". Only covers the flat blocking side (category/module/date);
// sub-rule exclusivity is inherently per-assignment and stays rule-shaped,
// resolved separately by whoever assembles AllocationRule/AllocationSubRule.
export interface StudentEligibility {
  studentId: string;
  ruleId: string | null;
  eligibleModuleIds: string[];
}

export async function resolveStudentEligibility(
  executor: DbExecutor,
  { projectId, studentIds }: { projectId: string; studentIds?: string[] },
): Promise<StudentEligibility[]> {
  const studentRows = await executor
    .select({
      id: students.id,
      ruleId: students.ruleId,
      groupRuleId: studentGroups.ruleId,
    })
    .from(students)
    .leftJoin(studentInGroup, eq(studentInGroup.studentId, students.id))
    .leftJoin(studentGroups, eq(studentGroups.id, studentInGroup.groupId))
    .where(
      studentIds
        ? and(eq(students.projectId, projectId), inArray(students.id, studentIds))
        : eq(students.projectId, projectId),
    );

  if (studentRows.length === 0) return [];

  // students.rule_id overrides student_groups.rule_id — same resolution used
  // everywhere else (see planning.md "Blocking Lives on the Rule").
  const effectiveRuleByStudent = new Map<string, string | null>(
    studentRows.map((row) => [row.id, row.ruleId ?? row.groupRuleId ?? null]),
  );
  const ruleIds = [...new Set(effectiveRuleByStudent.values())].filter((id): id is string => id !== null);

  const moduleRows = await executor.select({ id: modules.id }).from(modules).where(eq(modules.projectId, projectId));
  const moduleCategoryRows = await executor
    .select()
    .from(moduleInCategory)
    .where(eq(moduleInCategory.projectId, projectId));
  const moduleDateRows = await executor.select().from(moduleInDate).where(eq(moduleInDate.projectId, projectId));
  const compositionRows = await executor
    .select()
    .from(categoryIncludesCategory)
    .where(eq(categoryIncludesCategory.projectId, projectId));

  const blockedCategoryRows = ruleIds.length
    ? await executor.select().from(ruleBlockedCategory).where(inArray(ruleBlockedCategory.ruleId, ruleIds))
    : [];
  const blockedModuleRows = ruleIds.length
    ? await executor.select().from(ruleBlockedModule).where(inArray(ruleBlockedModule.ruleId, ruleIds))
    : [];
  const blockedDateRows = ruleIds.length
    ? await executor.select().from(ruleBlockedDate).where(inArray(ruleBlockedDate.ruleId, ruleIds))
    : [];

  // parent categories a category composes into, e.g. "Fußball" -> ["Sport"] —
  // walked transitively below so a module tagged with a sub-category also
  // counts as blocked when the rule blocks the parent.
  const parentsByCategory = new Map<string, string[]>();
  for (const row of compositionRows) {
    const list = parentsByCategory.get(row.subCategoryId) ?? [];
    list.push(row.parentCategoryId);
    parentsByCategory.set(row.subCategoryId, list);
  }
  function expandCategoryIds(directCategoryIds: string[]): Set<string> {
    const result = new Set(directCategoryIds);
    const queue = [...directCategoryIds];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const parent of parentsByCategory.get(current) ?? []) {
        if (!result.has(parent)) {
          result.add(parent);
          queue.push(parent);
        }
      }
    }
    return result;
  }

  const directCategoryIdsByModule = new Map<string, string[]>();
  for (const row of moduleCategoryRows) {
    const list = directCategoryIdsByModule.get(row.moduleId) ?? [];
    list.push(row.categoryId);
    directCategoryIdsByModule.set(row.moduleId, list);
  }
  const effectiveCategoryIdsByModule = new Map(
    moduleRows.map((m) => [m.id, expandCategoryIds(directCategoryIdsByModule.get(m.id) ?? [])]),
  );

  const dateIdsByModule = new Map<string, Set<string>>();
  for (const row of moduleDateRows) {
    const set = dateIdsByModule.get(row.moduleId) ?? new Set<string>();
    set.add(row.dateId);
    dateIdsByModule.set(row.moduleId, set);
  }

  const blockedCategoryIdsByRule = new Map<string, Set<string>>();
  for (const row of blockedCategoryRows) {
    const set = blockedCategoryIdsByRule.get(row.ruleId) ?? new Set<string>();
    set.add(row.categoryId);
    blockedCategoryIdsByRule.set(row.ruleId, set);
  }
  const blockedModuleIdsByRule = new Map<string, Set<string>>();
  for (const row of blockedModuleRows) {
    const set = blockedModuleIdsByRule.get(row.ruleId) ?? new Set<string>();
    set.add(row.moduleId);
    blockedModuleIdsByRule.set(row.ruleId, set);
  }
  const blockedDateIdsByRule = new Map<string, Set<string>>();
  for (const row of blockedDateRows) {
    const set = blockedDateIdsByRule.get(row.ruleId) ?? new Set<string>();
    set.add(row.dateId);
    blockedDateIdsByRule.set(row.ruleId, set);
  }

  return studentRows.map((row) => {
    const ruleId = effectiveRuleByStudent.get(row.id) ?? null;
    if (!ruleId) {
      return { studentId: row.id, ruleId: null, eligibleModuleIds: moduleRows.map((m) => m.id) };
    }

    const blockedCategoryIds = blockedCategoryIdsByRule.get(ruleId) ?? new Set<string>();
    const blockedModuleIds = blockedModuleIdsByRule.get(ruleId) ?? new Set<string>();
    // A blocked date has no separate representation on the result — it resolves to
    // "every module on that date" via module_in_date, exactly like a blocked category
    // resolves via module_in_category, so it's just another exclusion check below.
    const blockedDateIds = blockedDateIdsByRule.get(ruleId) ?? new Set<string>();

    const eligibleModuleIds = moduleRows
      .filter((m) => {
        if (blockedModuleIds.has(m.id)) return false;
        const categoryIds = effectiveCategoryIdsByModule.get(m.id) ?? new Set<string>();
        for (const categoryId of categoryIds) {
          if (blockedCategoryIds.has(categoryId)) return false;
        }
        const dateIds = dateIdsByModule.get(m.id) ?? new Set<string>();
        for (const dateId of dateIds) {
          if (blockedDateIds.has(dateId)) return false;
        }
        return true;
      })
      .map((m) => m.id);

    return { studentId: row.id, ruleId, eligibleModuleIds };
  });
}
