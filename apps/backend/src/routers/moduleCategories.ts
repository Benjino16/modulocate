import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { moduleCategoryCreateInput, moduleCategoryUpdateInput } from "@modulocate/shared";
import { db, moduleCategories } from "@modulocate/db";
import { router, publicProcedure } from "../trpc";
import { projectScoped } from "./shared";

export const moduleCategoriesRouter = router({
  list: publicProcedure.input(projectScoped).query(({ input }) =>
    db.select().from(moduleCategories).where(eq(moduleCategories.projectId, input.projectId)),
  ),

  get: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .query(async ({ input }) => {
      const [category] = await db
        .select()
        .from(moduleCategories)
        .where(and(eq(moduleCategories.id, input.id), eq(moduleCategories.projectId, input.projectId)));
      if (!category) throw new TRPCError({ code: "NOT_FOUND" });
      return category;
    }),

  create: publicProcedure
    .input(moduleCategoryCreateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      const [category] = await db.insert(moduleCategories).values(input).returning();
      return category;
    }),

  update: publicProcedure
    .input(moduleCategoryUpdateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      const { id, projectId, ...patch } = input;
      const [category] = await db
        .update(moduleCategories)
        .set(patch)
        .where(and(eq(moduleCategories.id, id), eq(moduleCategories.projectId, projectId)))
        .returning();
      if (!category) throw new TRPCError({ code: "NOT_FOUND" });
      return category;
    }),

  // Hard delete. Fails with a DB FK error if modules/sub-rules/blocking rows
  // still reference the category — same reasoning as modules.remove above.
  remove: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      const [category] = await db
        .delete(moduleCategories)
        .where(and(eq(moduleCategories.id, input.id), eq(moduleCategories.projectId, input.projectId)))
        .returning();
      if (!category) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: category.id };
    }),
});
