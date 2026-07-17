import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { studentGroupCreateInput, studentGroupUpdateInput } from "@modulocate/shared";
import { db, studentGroups } from "@modulocate/db";
import { router, publicProcedure } from "../trpc";
import { projectScoped } from "./shared";

export const studentGroupsRouter = router({
  list: publicProcedure.input(projectScoped).query(({ input }) =>
    db.select().from(studentGroups).where(eq(studentGroups.projectId, input.projectId)),
  ),

  get: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .query(async ({ input }) => {
      const [group] = await db
        .select()
        .from(studentGroups)
        .where(and(eq(studentGroups.id, input.id), eq(studentGroups.projectId, input.projectId)));
      if (!group) throw new TRPCError({ code: "NOT_FOUND" });
      return group;
    }),

  create: publicProcedure
    .input(studentGroupCreateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      const [group] = await db.insert(studentGroups).values(input).returning();
      return group;
    }),

  update: publicProcedure
    .input(studentGroupUpdateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      const { id, projectId, ...patch } = input;
      const [group] = await db
        .update(studentGroups)
        .set(patch)
        .where(and(eq(studentGroups.id, id), eq(studentGroups.projectId, projectId)))
        .returning();
      if (!group) throw new TRPCError({ code: "NOT_FOUND" });
      return group;
    }),

  // Hard delete, no soft-delete field on student_groups. Fails with a DB FK
  // error if students/blocking rows still reference the group — deliberately
  // left as the DB default (no onDelete) rather than guessing a cascade
  // policy before group-membership/blocking CRUD exists.
  remove: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      const [group] = await db
        .delete(studentGroups)
        .where(and(eq(studentGroups.id, input.id), eq(studentGroups.projectId, input.projectId)))
        .returning();
      if (!group) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: group.id };
    }),
});
