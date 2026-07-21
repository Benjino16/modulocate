import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { moduleCreateInput, moduleUpdateInput } from "@modulocate/shared";
import { db, modules, moduleInCategory, type DbExecutor } from "@modulocate/db";
import { router, publicProcedure } from "../trpc";
import { projectScoped } from "./shared";
import { sanitizeModuleDescription } from "../lib/sanitize";

// Batch-loads modules with their categoryIds (module_in_category) for a
// project (or a specific subset of module ids). Takes an explicit executor so
// callers inside a transaction can pass `tx` and see their own uncommitted writes.
async function loadModules(executor: DbExecutor, projectId: string, ids?: string[]) {
  const moduleRows = await executor
    .select()
    .from(modules)
    .where(
      ids
        ? and(eq(modules.projectId, projectId), inArray(modules.id, ids))
        : eq(modules.projectId, projectId),
    );
  if (moduleRows.length === 0) return [];

  const moduleIds = moduleRows.map((module) => module.id);
  const categoryRows = await executor
    .select()
    .from(moduleInCategory)
    .where(inArray(moduleInCategory.moduleId, moduleIds));

  const categoryIdsByModule = new Map<string, string[]>();
  for (const row of categoryRows) {
    const list = categoryIdsByModule.get(row.moduleId) ?? [];
    list.push(row.categoryId);
    categoryIdsByModule.set(row.moduleId, list);
  }

  return moduleRows.map((module) => ({
    ...module,
    categoryIds: categoryIdsByModule.get(module.id) ?? [],
  }));
}

export const modulesRouter = router({
  list: publicProcedure.input(projectScoped).query(({ input }) => loadModules(db, input.projectId)),

  get: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .query(async ({ input }) => {
      const [module] = await loadModules(db, input.projectId, [input.id]);
      if (!module) throw new TRPCError({ code: "NOT_FOUND" });
      return module;
    }),

  create: publicProcedure
    .input(moduleCreateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const { categoryIds, ...fields } = input;
        if (fields.description !== undefined) {
          fields.description = sanitizeModuleDescription(fields.description);
        }
        const [module] = await tx
          .insert(modules)
          .values({ ...fields, permanentName: randomUUID() })
          .returning();

        if (categoryIds.length > 0) {
          await tx.insert(moduleInCategory).values(
            categoryIds.map((categoryId) => ({
              moduleId: module.id,
              categoryId,
              projectId: input.projectId,
            })),
          );
        }

        return { ...module, categoryIds };
      });
    }),

  // Replaces the whole category set when `categoryIds` is provided, same
  // full-replace convention as rules.subRules/blockedCategoryIds.
  update: publicProcedure
    .input(moduleUpdateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const { id, projectId, categoryIds, ...patch } = input;
        if (patch.description !== undefined) {
          patch.description = sanitizeModuleDescription(patch.description);
        }

        const [existing] = await tx
          .select()
          .from(modules)
          .where(and(eq(modules.id, id), eq(modules.projectId, projectId)));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

        if (Object.keys(patch).length > 0) {
          await tx.update(modules).set(patch).where(eq(modules.id, id));
        }

        if (categoryIds) {
          await tx.delete(moduleInCategory).where(eq(moduleInCategory.moduleId, id));
          if (categoryIds.length > 0) {
            await tx.insert(moduleInCategory).values(
              categoryIds.map((categoryId) => ({ moduleId: id, categoryId, projectId })),
            );
          }
        }

        const [module] = await loadModules(tx, projectId, [id]);
        return module;
      });
    }),

  // Hard delete. Fails with a DB FK error if preferences/eligibility/blocking
  // rows still reference the module — deliberately left as the DB default
  // (no onDelete) rather than guessing a cascade policy; see planning.md.
  remove: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      const [module] = await db
        .delete(modules)
        .where(and(eq(modules.id, input.id), eq(modules.projectId, input.projectId)))
        .returning();
      if (!module) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: module.id };
    }),
});
