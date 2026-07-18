import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { ruleCreateInput, ruleUpdateInput } from "@modulocate/shared";
import { db, rules, subRules, categoryInSubRule, ruleBlockedCategory, type DbExecutor } from "@modulocate/db";
import { router, publicProcedure } from "../trpc";
import { projectScoped } from "./shared";

// Batch-loads rules with their nested sub-rules/categoryIds and blocked
// categories for a project (or a specific subset of rule ids). A handful of
// extra queries total, not one per rule. Takes an explicit executor so callers
// inside a transaction can pass `tx` and see their own uncommitted writes.
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

  return ruleRows.map((rule) => ({
    id: rule.id,
    projectId: rule.projectId,
    name: rule.name,
    moduleCount: rule.moduleCount,
    priority: rule.priority,
    subRules: subRulesByRule.get(rule.id) ?? [],
    blockedCategoryIds: blockedCategoryIdsByRule.get(rule.id) ?? [],
  }));
}

export const rulesRouter = router({
  list: publicProcedure.input(projectScoped).query(({ input }) => loadRules(db, input.projectId)),

  get: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .query(async ({ input }) => {
      const [rule] = await loadRules(db, input.projectId, [input.id]);
      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
      return rule;
    }),

  create: publicProcedure
    .input(ruleCreateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const [rule] = await tx
          .insert(rules)
          .values({
            projectId: input.projectId,
            name: input.name,
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

        return {
          id: rule.id,
          projectId: rule.projectId,
          name: rule.name,
          moduleCount: rule.moduleCount,
          priority: rule.priority,
          subRules: insertedSubRules.map((subRule, i) => ({
            id: subRule.id,
            categoryIds: input.subRules[i].categoryIds,
          })),
          blockedCategoryIds: input.blockedCategoryIds,
        };
      });
    }),

  // Replaces the whole sub-rule / blocked-category set when provided (see
  // ruleUpdateInput's comment in packages/shared) rather than diffing
  // individual rows — deleting sub_rules cascades to category_in_sub_rule.
  update: publicProcedure
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

        const [updated] = await loadRules(tx, input.projectId, [input.id]);
        return updated;
      });
    }),

  // Hard delete — rules have no soft-delete field in db_planning.md. Cascades
  // to sub_rules/category_in_sub_rule; groups/students referencing this rule
  // just fall back to null (see schema.ts onDelete: "set null").
  remove: publicProcedure
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
