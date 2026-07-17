import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { ruleCreateInput, ruleUpdateInput } from "@modulocate/shared";
import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { rules, subRules, categoryInSubRule } from "../db/schema";
import { projectScoped } from "./shared";

// Batch-loads rules with their nested sub-rules/categoryIds for a project (or a
// specific subset of rule ids). Two extra queries total, not one per rule.
async function loadRules(projectId: string, ids?: string[]) {
  const ruleRows = await db
    .select()
    .from(rules)
    .where(
      ids
        ? and(eq(rules.projectId, projectId), inArray(rules.id, ids))
        : eq(rules.projectId, projectId),
    );
  if (ruleRows.length === 0) return [];

  const ruleIds = ruleRows.map((rule) => rule.id);
  const subRuleRows = await db.select().from(subRules).where(inArray(subRules.ruleId, ruleIds));

  const subRuleIds = subRuleRows.map((subRule) => subRule.id);
  const categoryRows = subRuleIds.length
    ? await db.select().from(categoryInSubRule).where(inArray(categoryInSubRule.subRuleId, subRuleIds))
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

  return ruleRows.map((rule) => ({
    id: rule.id,
    projectId: rule.projectId,
    name: rule.name,
    subRules: subRulesByRule.get(rule.id) ?? [],
  }));
}

export const rulesRouter = router({
  list: publicProcedure.input(projectScoped).query(({ input }) => loadRules(input.projectId)),

  get: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .query(async ({ input }) => {
      const [rule] = await loadRules(input.projectId, [input.id]);
      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
      return rule;
    }),

  create: publicProcedure
    .input(ruleCreateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const [rule] = await tx
          .insert(rules)
          .values({ projectId: input.projectId, name: input.name })
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

        return {
          id: rule.id,
          projectId: rule.projectId,
          name: rule.name,
          subRules: insertedSubRules.map((subRule, i) => ({
            id: subRule.id,
            categoryIds: input.subRules[i].categoryIds,
          })),
        };
      });
    }),

  // Replaces the whole sub-rule set when `subRules` is provided (see
  // ruleUpdateInput's comment in packages/shared) rather than diffing
  // individual sub-rules — deleting cascades to category_in_sub_rule.
  update: publicProcedure
    .input(ruleUpdateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(rules)
          .where(and(eq(rules.id, input.id), eq(rules.projectId, input.projectId)));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

        const name = input.name ?? existing.name;
        if (input.name !== undefined) {
          await tx.update(rules).set({ name }).where(eq(rules.id, input.id));
        }

        if (!input.subRules) {
          const [unchanged] = await loadRules(input.projectId, [input.id]);
          return { ...unchanged, name };
        }

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

        return {
          id: input.id,
          projectId: input.projectId,
          name,
          subRules: insertedSubRules.map((subRule, i) => ({
            id: subRule.id,
            categoryIds: input.subRules![i].categoryIds,
          })),
        };
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
