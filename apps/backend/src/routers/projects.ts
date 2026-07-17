import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, projects, students } from "@modulocate/db";
import { router, publicProcedure } from "../trpc";
import { projectScoped } from "./shared";
import { enqueueVotingInvites } from "./students";

// Stopgap until auth/sessions exist: lists every project so the portal's
// project switcher has something to select from (see projectScoped in ./shared).
export const projectsRouter = router({
  list: publicProcedure.query(() => db.select().from(projects)),

  // setup -> open (see planning.md "Locked Decision: `phase` Column on
  // `projects`"). Mints a sign-in code for every student who doesn't have
  // one yet, flips the phase, then dispatches the voting-invite email to
  // every student in the project — a retry after a partial failure is safe:
  // already-coded students keep their code, already-queued invites just get
  // re-sent.
  startElection: publicProcedure.input(projectScoped).mutation(async ({ input }) => {
    const { project, studentIds } = await db.transaction(async (tx) => {
      const [project] = await tx.select().from(projects).where(eq(projects.id, input.projectId));
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (project.phase !== "setup") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Die Umfrage kann nur aus Phase "setup" gestartet werden (aktuell: "${project.phase}").`,
        });
      }

      const uncoded = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.projectId, input.projectId), isNull(students.signInCode)));
      for (const student of uncoded) {
        await tx
          .update(students)
          .set({ signInCode: randomBytes(24).toString("base64url") })
          .where(eq(students.id, student.id));
      }

      const [updated] = await tx
        .update(projects)
        .set({ phase: "open" })
        .where(eq(projects.id, input.projectId))
        .returning();

      const allStudents = await tx.select({ id: students.id }).from(students).where(eq(students.projectId, input.projectId));
      return { project: updated, studentIds: allStudents.map((s) => s.id) };
    });

    const invitesEnqueued = await enqueueVotingInvites(input.projectId, studentIds);
    return { project, invitesEnqueued };
  }),
});
