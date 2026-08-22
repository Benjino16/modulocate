import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { projectPhase } from "@modulocate/shared";
import {
  db,
  modules,
  moduleCategories,
  moduleInCategory,
  projects,
  settings,
  students,
  studentPreferences,
  resolveStudentEligibility,
  resolveModuleDisplayScheduleLabels,
  resolveAllocationRuleById,
  resolveModuleAllocationFields,
} from "@modulocate/db";
import { router, protectedStudentProcedure } from "../trpc";

export const voteRouter = router({
  // The intro page shown before the survey itself (see planning.md/portal
  // settings "Begrüßungstext in der Umfrage") — rich-text HTML, already
  // sanitized on save.
  welcomeText: protectedStudentProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(and(eq(settings.projectId, ctx.student.projectId), eq(settings.key, "welcomeText")));
    return (row?.value as string) ?? "";
  }),

  // Modules the logged-in student is currently allowed to see — resolved
  // live per request, not from a snapshot (see planning.md "Deferred
  // Decision: Live Resolution for the Vote App").
  // Also returns the raw data the vote app needs to run a client-side,
  // single-student allocation-engine preview ("what would I get, assuming no
  // competition") on every reorder without a network round-trip — see
  // apps/vote/src/lib/simulateAllocation.ts. `rule` is the one rule
  // effective for this student (never every project rule); module rows carry
  // both the existing display-only fields and raw categoryIds/dateIds for
  // the engine.
  eligibleModules: protectedStudentProcedure.query(async ({ ctx }) => {
    const [eligibility] = await resolveStudentEligibility(db, {
      projectId: ctx.student.projectId,
      studentIds: [ctx.student.studentId],
    });
    const eligibleModuleIds = eligibility?.eligibleModuleIds ?? [];
    if (eligibleModuleIds.length === 0) return { modules: [], rule: null };
    const moduleRows = await db
      .select()
      .from(modules)
      .where(and(eq(modules.projectId, ctx.student.projectId), inArray(modules.id, eligibleModuleIds)));

    const displayScheduleLabelByModule = await resolveModuleDisplayScheduleLabels(db, eligibleModuleIds);

    // Only categories not flagged hiddenInVote should ever surface to
    // students by name — join + filter here rather than in the frontend so a
    // hidden category's name never even reaches the vote app's network
    // response. Its id still reaches the client via categoryIdsByModule
    // below, since the engine needs it for sub-rule matching regardless.
    const categoryRows = await db
      .select({ moduleId: moduleInCategory.moduleId, name: moduleCategories.name })
      .from(moduleInCategory)
      .innerJoin(moduleCategories, eq(moduleInCategory.categoryId, moduleCategories.id))
      .where(
        and(
          inArray(moduleInCategory.moduleId, eligibleModuleIds),
          eq(moduleCategories.hiddenInVote, false),
        ),
      );
    const categoryNamesByModule = new Map<string, string[]>();
    for (const row of categoryRows) {
      const list = categoryNamesByModule.get(row.moduleId) ?? [];
      list.push(row.name);
      categoryNamesByModule.set(row.moduleId, list);
    }

    const [rule, { categoryIdsByModule, dateIdsByModule }] = await Promise.all([
      eligibility?.ruleId ? resolveAllocationRuleById(db, eligibility.ruleId) : Promise.resolve(null),
      resolveModuleAllocationFields(db, eligibleModuleIds),
    ]);

    return {
      modules: moduleRows.map((module) => ({
        ...module,
        displayScheduleLabel: module.scheduleLabel || displayScheduleLabelByModule.get(module.id) || null,
        categoryNames: categoryNamesByModule.get(module.id) ?? [],
        categoryIds: categoryIdsByModule.get(module.id) ?? [],
        dateIds: dateIdsByModule.get(module.id) ?? [],
      })),
      rule,
    };
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
      if (!project || project.phase !== projectPhase.enum.voting) {
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
        await tx
          .update(students)
          .set({ voteStatus: "voted", voteSubmittedAt: new Date() })
          .where(eq(students.id, ctx.student.studentId));
      });

      return { success: true as const };
    }),
});
