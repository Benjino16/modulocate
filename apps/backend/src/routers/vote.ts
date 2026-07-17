import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, modules, projects, students, studentPreferences, resolveStudentEligibility } from "@modulocate/db";
import { router, protectedStudentProcedure } from "../trpc";

export const voteRouter = router({
  // Modules the logged-in student is currently allowed to see — resolved
  // live per request, not from a snapshot (see planning.md "Deferred
  // Decision: Live Resolution for the Vote App").
  eligibleModules: protectedStudentProcedure.query(async ({ ctx }) => {
    const [eligibility] = await resolveStudentEligibility(db, {
      projectId: ctx.student.projectId,
      studentIds: [ctx.student.studentId],
    });
    const eligibleModuleIds = eligibility?.eligibleModuleIds ?? [];
    if (eligibleModuleIds.length === 0) return [];
    return db
      .select()
      .from(modules)
      .where(and(eq(modules.projectId, ctx.student.projectId), inArray(modules.id, eligibleModuleIds)));
  }),

  myPreferences: protectedStudentProcedure.query(({ ctx }) =>
    db
      .select({ moduleId: studentPreferences.moduleId, preference: studentPreferences.preference })
      .from(studentPreferences)
      .where(eq(studentPreferences.studentId, ctx.student.studentId))
      .orderBy(studentPreferences.preference),
  ),

  // Ranked list of module ids, most preferred first — rank is derived from
  // array position rather than passed explicitly, matching a reorderable-list
  // vote UI. Resubmitting while the election is still open replaces the
  // whole set (simpler and just as correct as diffing individual ranks).
  // No min/max-count validation yet — that's a per-election rule
  // ("N modules per student") that isn't modeled anywhere in the schema yet,
  // see planning.md Section 6; not guessing a policy here ahead of that.
  submitPreferences: protectedStudentProcedure
    .input(z.object({ moduleIds: z.array(z.uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [project] = await db.select().from(projects).where(eq(projects.id, ctx.student.projectId));
      if (!project || project.phase !== "open") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Die Umfrage ist aktuell nicht offen.",
        });
      }

      const [eligibility] = await resolveStudentEligibility(db, {
        projectId: ctx.student.projectId,
        studentIds: [ctx.student.studentId],
      });
      const eligibleModuleIds = new Set(eligibility?.eligibleModuleIds ?? []);
      const ineligible = input.moduleIds.filter((id) => !eligibleModuleIds.has(id));
      if (ineligible.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Auswahl enthält Module, die nicht zur Verfügung stehen.",
        });
      }

      await db.transaction(async (tx) => {
        await tx.delete(studentPreferences).where(eq(studentPreferences.studentId, ctx.student.studentId));
        await tx.insert(studentPreferences).values(
          input.moduleIds.map((moduleId, index) => ({
            studentId: ctx.student.studentId,
            moduleId,
            projectId: ctx.student.projectId,
            preference: index + 1,
          })),
        );
        await tx.update(students).set({ voteStatus: "voted" }).where(eq(students.id, ctx.student.studentId));
      });

      return { success: true as const };
    }),
});
