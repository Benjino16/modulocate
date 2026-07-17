import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { moduleCreateInput, moduleUpdateInput } from "@modulocate/shared";
import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { modules } from "../db/schema";
import { projectScoped } from "./shared";

export const modulesRouter = router({
  list: publicProcedure.input(projectScoped).query(({ input }) =>
    db.select().from(modules).where(eq(modules.projectId, input.projectId)),
  ),

  get: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .query(async ({ input }) => {
      const [module] = await db
        .select()
        .from(modules)
        .where(and(eq(modules.id, input.id), eq(modules.projectId, input.projectId)));
      if (!module) throw new TRPCError({ code: "NOT_FOUND" });
      return module;
    }),

  create: publicProcedure
    .input(moduleCreateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      const [module] = await db
        .insert(modules)
        .values({ ...input, permanentName: randomUUID() })
        .returning();
      return module;
    }),

  update: publicProcedure
    .input(moduleUpdateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      const { id, projectId, ...patch } = input;
      const [module] = await db
        .update(modules)
        .set(patch)
        .where(and(eq(modules.id, id), eq(modules.projectId, projectId)))
        .returning();
      if (!module) throw new TRPCError({ code: "NOT_FOUND" });
      return module;
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
