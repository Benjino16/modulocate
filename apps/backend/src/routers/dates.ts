import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { dateCreateInput, dateUpdateInput } from "@modulocate/shared";
import { db, dates, moduleInDate } from "@modulocate/db";
import { router, staffProcedure } from "../trpc";
import { projectScoped } from "./shared";

export const datesRouter = router({
  list: staffProcedure.input(projectScoped).query(({ input }) =>
    db
      .select({
        id: dates.id,
        projectId: dates.projectId,
        name: dates.name,
        moduleCount: count(moduleInDate.moduleId),
      })
      .from(dates)
      .leftJoin(moduleInDate, eq(moduleInDate.dateId, dates.id))
      .where(eq(dates.projectId, input.projectId))
      .groupBy(dates.id),
  ),

  get: staffProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .query(async ({ input }) => {
      const [date] = await db
        .select()
        .from(dates)
        .where(and(eq(dates.id, input.id), eq(dates.projectId, input.projectId)));
      if (!date) throw new TRPCError({ code: "NOT_FOUND" });
      return date;
    }),

  create: staffProcedure
    .input(dateCreateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      const [date] = await db.insert(dates).values(input).returning();
      return date;
    }),

  update: staffProcedure
    .input(dateUpdateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      const { id, projectId, ...patch } = input;
      const [date] = await db
        .update(dates)
        .set(patch)
        .where(and(eq(dates.id, id), eq(dates.projectId, projectId)))
        .returning();
      if (!date) throw new TRPCError({ code: "NOT_FOUND" });
      return date;
    }),

  // Hard delete. Fails with a DB FK error if modules/blocking rows still
  // reference the date — same reasoning as modules.remove above.
  remove: staffProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      const [date] = await db
        .delete(dates)
        .where(and(eq(dates.id, input.id), eq(dates.projectId, input.projectId)))
        .returning();
      if (!date) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: date.id };
    }),
});
