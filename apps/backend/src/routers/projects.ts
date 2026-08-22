import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projectCreateInput, projectPhase } from "@modulocate/shared";
import { db, projects, students, studentInModule } from "@modulocate/db";
import { deleteAllocationRunsForProject } from "@modulocate/queue";
import { router, staffProcedure } from "../trpc";
import { projectScoped } from "./shared";
import { enqueueVotingResults } from "./students";

// Stopgap until auth/sessions exist: lists every project so the portal's
// project switcher has something to select from (see projectScoped in ./shared).
export const projectsRouter = router({
  list: staffProcedure.query(() => db.select().from(projects)),

  // Phase defaults to "setup" at the DB level (see packages/db/src/schema.ts).
  create: staffProcedure.input(projectCreateInput).mutation(async ({ input }) => {
    const [project] = await db.insert(projects).values(input).returning();
    return project;
  }),

  // setup|allocating|reviewing -> voting (see planning.md "Locked Decision:
  // `phase` Column on `projects`"). Only flips the phase — sending the
  // voting-invite emails is a separate, explicit step
  // (students.sendVotingInvites; see the portal's "E-Mails verschicken"
  // button), not a side effect of opening. Reopening from
  // allocating/reviewing is a backward transition: any allocation output
  // computed against the old vote set is stale the instant new votes can
  // come in, so it's deleted here — both student_in_module (the loaded
  // assignments) and every stored run in Redis, not just the currently
  // "reviewing" one.
  openElection: staffProcedure.input(projectScoped).mutation(async ({ input }) => {
    const { project, reopening } = await db.transaction(async (tx) => {
      const [project] = await tx.select().from(projects).where(eq(projects.id, input.projectId));
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      const reopening =
        project.phase === projectPhase.enum.allocating || project.phase === projectPhase.enum.reviewing;
      if (project.phase !== projectPhase.enum.setup && !reopening) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Die Umfrage kann nur aus Phase "${projectPhase.enum.setup}", "${projectPhase.enum.allocating}" oder "${projectPhase.enum.reviewing}" geöffnet werden (aktuell: "${project.phase}").`,
        });
      }

      if (reopening) {
        await tx.delete(studentInModule).where(eq(studentInModule.projectId, input.projectId));
      }

      const [updated] = await tx
        .update(projects)
        .set({ phase: projectPhase.enum.voting })
        .where(eq(projects.id, input.projectId))
        .returning();

      return { project: updated, reopening };
    });

    // Redis isn't transactional with Postgres, so this runs after commit —
    // same pattern as the email dispatch below in publishResults.
    if (reopening) {
      await deleteAllocationRunsForProject(input.projectId);
    }

    return { project };
  }),

  // voting -> allocating. No more email/side effects than the phase flip
  // itself — the allocation run is a separate, user-triggered step on the
  // "Zuteilung" page, not something this mutation kicks off.
  stopElection: staffProcedure.input(projectScoped).mutation(async ({ input }) => {
    const [project] = await db.transaction(async (tx) => {
      const [project] = await tx.select().from(projects).where(eq(projects.id, input.projectId));
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (project.phase !== projectPhase.enum.voting) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Die Umfrage kann nur aus Phase "${projectPhase.enum.voting}" gestoppt werden (aktuell: "${project.phase}").`,
        });
      }

      return tx
        .update(projects)
        .set({ phase: projectPhase.enum.allocating })
        .where(eq(projects.id, input.projectId))
        .returning();
    });

    return { project };
  }),

  // reviewing -> published (see planning.md Phase 5 "Publication"). Locks the
  // allocation in and dispatches the final module assignment to every
  // student — retry-safe: a retry after a partial failure just re-sends
  // already-queued results (see enqueueVotingResults).
  publishResults: staffProcedure.input(projectScoped).mutation(async ({ input }) => {
    const { project, studentIds } = await db.transaction(async (tx) => {
      const [project] = await tx.select().from(projects).where(eq(projects.id, input.projectId));
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (project.phase !== projectPhase.enum.reviewing) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Die Ergebnisse können nur aus Phase "${projectPhase.enum.reviewing}" versendet werden (aktuell: "${project.phase}").`,
        });
      }

      const [updated] = await tx
        .update(projects)
        .set({ phase: projectPhase.enum.published })
        .where(eq(projects.id, input.projectId))
        .returning();

      const allStudents = await tx.select({ id: students.id }).from(students).where(eq(students.projectId, input.projectId));
      return { project: updated, studentIds: allStudents.map((s) => s.id) };
    });

    const resultsEnqueued = await enqueueVotingResults(input.projectId, studentIds);
    return { project, resultsEnqueued };
  }),
});
