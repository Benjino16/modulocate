import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { ruleCreateInput, ruleUpdateInput } from "@modulocate/shared";
import {
  db,
  rules,
  subRules,
  categoryInSubRule,
  ruleBlockedCategory,
  ruleBlockedDate,
  students,
  studentGroups,
  studentInGroup,
  studentInModule,
  studentPreferences,
  type DbExecutor,
} from "@modulocate/db";
import { router, staffProcedure } from "../trpc";
import { projectScoped } from "./shared";
import { sanitizeRichText } from "../lib/sanitize";

// Batch-loads rules with their nested sub-rules/categoryIds and blocked
// categories/dates for a project (or a specific subset of rule ids). A handful
// of extra queries total, not one per rule. Takes an explicit executor so
// callers inside a transaction can pass `tx` and see their own uncommitted writes.
async function loadRules(executor: DbExecutor, projectId: string, ids?: string[]) {
  const ruleRows = await executor
    .select()
    .from(rules)
    .where(
      ids
        ? and(eq(rules.projectId, projectId), inArray(rules.id, ids))
        : eq(rules.projectId, projectId),
    );
  if (ruleRows.length === 0) return [];

  const ruleIds = ruleRows.map((rule) => rule.id);
  const subRuleRows = await executor.select().from(subRules).where(inArray(subRules.ruleId, ruleIds));
  const blockedCategoryRows = await executor
    .select()
    .from(ruleBlockedCategory)
    .where(inArray(ruleBlockedCategory.ruleId, ruleIds));
  const blockedDateRows = await executor
    .select()
    .from(ruleBlockedDate)
    .where(inArray(ruleBlockedDate.ruleId, ruleIds));

  const subRuleIds = subRuleRows.map((subRule) => subRule.id);
  const categoryRows = subRuleIds.length
    ? await executor.select().from(categoryInSubRule).where(inArray(categoryInSubRule.subRuleId, subRuleIds))
    : [];

  const categoryIdsBySubRule = new Map<string, string[]>();
  for (const row of categoryRows) {
    const list = categoryIdsBySubRule.get(row.subRuleId) ?? [];
    list.push(row.categoryId);
    categoryIdsBySubRule.set(row.subRuleId, list);
  }

  const subRulesByRule = new Map<string, { id: string; categoryIds: string[] }[]>();
  for (const subRule of subRuleRows) {
    const list = subRulesByRule.get(subRule.ruleId) ?? [];
    list.push({ id: subRule.id, categoryIds: categoryIdsBySubRule.get(subRule.id) ?? [] });
    subRulesByRule.set(subRule.ruleId, list);
  }

  const blockedCategoryIdsByRule = new Map<string, string[]>();
  for (const row of blockedCategoryRows) {
    const list = blockedCategoryIdsByRule.get(row.ruleId) ?? [];
    list.push(row.categoryId);
    blockedCategoryIdsByRule.set(row.ruleId, list);
  }

  const blockedDateIdsByRule = new Map<string, string[]>();
  for (const row of blockedDateRows) {
    const list = blockedDateIdsByRule.get(row.ruleId) ?? [];
    list.push(row.dateId);
    blockedDateIdsByRule.set(row.ruleId, list);
  }

  // Students carrying each rule, and the mean preference rank across their
  // assigned modules — pooled over every student with the rule (not an
  // average of per-student averages), so a rule with more students weighs
  // proportionally more. Same "ranked but not necessarily assigned by
  // choice" caveat as students.ts's averagePreference: only counts modules
  // the student actually ranked, and only students that carry this rule.
  //
  // "Carries this rule" follows the same student.ruleId ?? group.ruleId
  // fallback used everywhere else (resolveStudentEligibility, allocationInput,
  // resolveRuleCompliance) — a student's own rule overrides their group's,
  // but a student with no rule of their own still inherits their group's.
  // Pulled project-wide (not filtered by ruleIds up front) since a student
  // can only reach one of the requested rules via their group, which an
  // inArray(students.ruleId, ruleIds) filter would miss entirely.
  const studentRows = await executor
    .select({ id: students.id, ruleId: students.ruleId, groupRuleId: studentGroups.ruleId })
    .from(students)
    .leftJoin(studentInGroup, eq(studentInGroup.studentId, students.id))
    .leftJoin(studentGroups, eq(studentGroups.id, studentInGroup.groupId))
    .where(eq(students.projectId, projectId));

  const ruleIdByStudent = new Map<string, string | null>(
    studentRows.map((row) => [row.id, row.ruleId ?? row.groupRuleId ?? null]),
  );
  const studentIdsByRule = new Map<string, string[]>();
  for (const [studentId, ruleId] of ruleIdByStudent) {
    if (!ruleId) continue;
    const list = studentIdsByRule.get(ruleId) ?? [];
    list.push(studentId);
    studentIdsByRule.set(ruleId, list);
  }

  const studentIdsWithRule = [...ruleIdByStudent.entries()]
    .filter(([, ruleId]) => ruleId !== null)
    .map(([studentId]) => studentId);

  const preferenceRows = studentIdsWithRule.length
    ? await executor
        .select({
          studentId: studentInModule.studentId,
          preference: studentPreferences.preference,
        })
        .from(studentInModule)
        .innerJoin(
          studentPreferences,
          and(
            eq(studentPreferences.studentId, studentInModule.studentId),
            eq(studentPreferences.moduleId, studentInModule.moduleId),
          ),
        )
        .where(and(eq(studentInModule.projectId, projectId), inArray(studentInModule.studentId, studentIdsWithRule)))
    : [];

  const preferencesByRule = new Map<string, number[]>();
  for (const row of preferenceRows) {
    const ruleId = ruleIdByStudent.get(row.studentId);
    if (!ruleId) continue;
    const list = preferencesByRule.get(ruleId) ?? [];
    list.push(row.preference);
    preferencesByRule.set(ruleId, list);
  }

  return ruleRows.map((rule) => ({
    id: rule.id,
    projectId: rule.projectId,
    name: rule.name,
    description: rule.description,
    moduleCount: rule.moduleCount,
    priority: rule.priority,
    subRules: subRulesByRule.get(rule.id) ?? [],
    blockedCategoryIds: blockedCategoryIdsByRule.get(rule.id) ?? [],
    blockedDateIds: blockedDateIdsByRule.get(rule.id) ?? [],
    studentCount: studentIdsByRule.get(rule.id)?.length ?? 0,
    averagePreference: average(preferencesByRule.get(rule.id) ?? []),
  }));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export const rulesRouter = router({
  list: staffProcedure.input(projectScoped).query(({ input }) => loadRules(db, input.projectId)),

  get: staffProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .query(async ({ input }) => {
      const [rule] = await loadRules(db, input.projectId, [input.id]);
      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
      return rule;
    }),

  create: staffProcedure
    .input(ruleCreateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const [rule] = await tx
          .insert(rules)
          .values({
            projectId: input.projectId,
            name: input.name,
            description: input.description !== undefined ? sanitizeRichText(input.description) : undefined,
            moduleCount: input.moduleCount,
            priority: input.priority,
          })
          .returning();

        const insertedSubRules =
          input.subRules.length > 0
            ? await tx
                .insert(subRules)
                .values(input.subRules.map(() => ({ ruleId: rule.id, projectId: input.projectId })))
                .returning()
            : [];

        const categoryRows = insertedSubRules.flatMap((subRule, i) =>
          input.subRules[i].categoryIds.map((categoryId) => ({
            subRuleId: subRule.id,
            categoryId,
            projectId: input.projectId,
          })),
        );
        if (categoryRows.length > 0) {
          await tx.insert(categoryInSubRule).values(categoryRows);
        }

        if (input.blockedCategoryIds.length > 0) {
          await tx.insert(ruleBlockedCategory).values(
            input.blockedCategoryIds.map((categoryId) => ({
              ruleId: rule.id,
              categoryId,
              projectId: input.projectId,
            })),
          );
        }

        if (input.blockedDateIds.length > 0) {
          await tx.insert(ruleBlockedDate).values(
            input.blockedDateIds.map((dateId) => ({
              ruleId: rule.id,
              dateId,
              projectId: input.projectId,
            })),
          );
        }

        return {
          id: rule.id,
          projectId: rule.projectId,
          name: rule.name,
          description: rule.description,
          moduleCount: rule.moduleCount,
          priority: rule.priority,
          subRules: insertedSubRules.map((subRule, i) => ({
            id: subRule.id,
            categoryIds: input.subRules[i].categoryIds,
          })),
          blockedCategoryIds: input.blockedCategoryIds,
          blockedDateIds: input.blockedDateIds,
          studentCount: 0,
          averagePreference: null,
        };
      });
    }),

  // Replaces the whole sub-rule / blocked-category / blocked-date set when
  // provided (see ruleUpdateInput's comment in packages/shared) rather than
  // diffing individual rows — deleting sub_rules cascades to category_in_sub_rule.
  update: staffProcedure
    .input(ruleUpdateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(rules)
          .where(and(eq(rules.id, input.id), eq(rules.projectId, input.projectId)));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

        const patch = {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && {
            description: input.description === null ? null : sanitizeRichText(input.description),
          }),
          ...(input.moduleCount !== undefined && { moduleCount: input.moduleCount }),
          ...(input.priority !== undefined && { priority: input.priority }),
        };
        if (Object.keys(patch).length > 0) {
          await tx.update(rules).set(patch).where(eq(rules.id, input.id));
        }

        if (input.subRules) {
          await tx.delete(subRules).where(eq(subRules.ruleId, input.id));

          const insertedSubRules =
            input.subRules.length > 0
              ? await tx
                  .insert(subRules)
                  .values(input.subRules.map(() => ({ ruleId: input.id, projectId: input.projectId })))
                  .returning()
              : [];

          const categoryRows = insertedSubRules.flatMap((subRule, i) =>
            input.subRules![i].categoryIds.map((categoryId) => ({
              subRuleId: subRule.id,
              categoryId,
              projectId: input.projectId,
            })),
          );
          if (categoryRows.length > 0) {
            await tx.insert(categoryInSubRule).values(categoryRows);
          }
        }

        if (input.blockedCategoryIds) {
          await tx.delete(ruleBlockedCategory).where(eq(ruleBlockedCategory.ruleId, input.id));

          if (input.blockedCategoryIds.length > 0) {
            await tx.insert(ruleBlockedCategory).values(
              input.blockedCategoryIds.map((categoryId) => ({
                ruleId: input.id,
                categoryId,
                projectId: input.projectId,
              })),
            );
          }
        }

        if (input.blockedDateIds) {
          await tx.delete(ruleBlockedDate).where(eq(ruleBlockedDate.ruleId, input.id));

          if (input.blockedDateIds.length > 0) {
            await tx.insert(ruleBlockedDate).values(
              input.blockedDateIds.map((dateId) => ({
                ruleId: input.id,
                dateId,
                projectId: input.projectId,
              })),
            );
          }
        }

        const [updated] = await loadRules(tx, input.projectId, [input.id]);
        return updated;
      });
    }),

  // Hard delete — rules have no soft-delete field in db_planning.md. Cascades
  // to sub_rules/category_in_sub_rule; groups/students referencing this rule
  // just fall back to null (see schema.ts onDelete: "set null").
  remove: staffProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      const [rule] = await db
        .delete(rules)
        .where(and(eq(rules.id, input.id), eq(rules.projectId, input.projectId)))
        .returning();
      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: rule.id };
    }),
});
