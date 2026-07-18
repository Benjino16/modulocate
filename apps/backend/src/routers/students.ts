import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { studentCreateInput, studentUpdateInput } from "@modulocate/shared";
import { db, rules, studentGroups, studentInGroup, students } from "@modulocate/db";
import { EmailJobName, getEmailQueue } from "@modulocate/queue";
import { router, publicProcedure } from "../trpc";
import { projectScoped, type DbExecutor } from "./shared";

// Attaches each student's "Klasse" (single student_in_group membership, left-
// joined so students without one still come back) — see groupId's comment in
// packages/shared/src/student.ts for why this isn't a plain column. Takes an
// explicit executor (db or an open tx) so callers inside a transaction read
// their own uncommitted writes instead of racing the outer connection.
async function loadStudents(executor: DbExecutor, projectId: string, ids?: string[]) {
  return executor
    .select({
      id: students.id,
      projectId: students.projectId,
      name: students.name,
      email: students.email,
      email2: students.email2,
      signInCode: students.signInCode,
      voteStatus: students.voteStatus,
      voteOpenedAt: students.voteOpenedAt,
      voteSubmittedAt: students.voteSubmittedAt,
      ruleId: students.ruleId,
      ruleName: rules.name,
      groupId: studentGroups.id,
      groupName: studentGroups.name,
    })
    .from(students)
    .leftJoin(studentInGroup, eq(studentInGroup.studentId, students.id))
    .leftJoin(studentGroups, eq(studentGroups.id, studentInGroup.groupId))
    .leftJoin(rules, eq(rules.id, students.ruleId))
    .where(
      ids
        ? and(eq(students.projectId, projectId), inArray(students.id, ids))
        : eq(students.projectId, projectId),
    );
}

export const studentsRouter = router({
  list: publicProcedure.input(projectScoped).query(({ input }) => loadStudents(db, input.projectId)),

  get: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .query(async ({ input }) => {
      const [student] = await loadStudents(db, input.projectId, [input.id]);
      if (!student) throw new TRPCError({ code: "NOT_FOUND" });
      return student;
    }),

  create: publicProcedure
    .input(studentCreateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      const { groupId, ...rest } = input;
      return db.transaction(async (tx) => {
        const [student] = await tx
          .insert(students)
          .values({ ...rest, voteStatus: "not_voted" })
          .returning();
        if (groupId) {
          await tx.insert(studentInGroup).values({ studentId: student.id, groupId, projectId: input.projectId });
        }
        const [full] = await loadStudents(tx, input.projectId, [student.id]);
        return full;
      });
    }),

  update: publicProcedure
    .input(studentUpdateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      const { id, projectId, groupId, ...patch } = input;
      return db.transaction(async (tx) => {
        // groupId-only updates leave `patch` empty — drizzle's .set({}) throws,
        // so skip the column update and just confirm the row exists.
        const [student] =
          Object.keys(patch).length > 0
            ? await tx
                .update(students)
                .set(patch)
                .where(and(eq(students.id, id), eq(students.projectId, projectId)))
                .returning()
            : await tx
                .select()
                .from(students)
                .where(and(eq(students.id, id), eq(students.projectId, projectId)));
        if (!student) throw new TRPCError({ code: "NOT_FOUND" });

        if (groupId !== undefined) {
          await tx
            .delete(studentInGroup)
            .where(and(eq(studentInGroup.studentId, id), eq(studentInGroup.projectId, projectId)));
          if (groupId) {
            await tx.insert(studentInGroup).values({ studentId: id, groupId, projectId });
          }
        }

        const [full] = await loadStudents(tx, projectId, [id]);
        return full;
      });
    }),

  // Hard delete. The student's own group membership is cleared first since
  // "Klasse" is a routine field here (not allocation-engine state) — leaving
  // it would FK-fail every delete for any student with a class set. Still
  // fails with a DB FK error if preferences/eligibility/blocking rows still
  // reference the student — deliberately left as the DB default (no
  // onDelete) rather than guessing a cascade policy; see planning.md.
  remove: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      const [student] = await db.transaction(async (tx) => {
        await tx
          .delete(studentInGroup)
          .where(and(eq(studentInGroup.studentId, input.id), eq(studentInGroup.projectId, input.projectId)));
        return tx
          .delete(students)
          .where(and(eq(students.id, input.id), eq(students.projectId, input.projectId)))
          .returning();
      });
      if (!student) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: student.id };
    }),

  // Enqueues one job per student (not one job for the whole project) so a bad
  // address only retries itself and the worker's rate limiter throttles the
  // whole batch against SMTP limits. Returns immediately — see email_log for
  // delivery status once the worker processes the batch.
  sendVotingInvites: publicProcedure
    .input(projectScoped.extend({ studentIds: z.array(z.uuid()).optional() }))
    .mutation(async ({ input }) => {
      const enqueued = await enqueueVotingInvites(input.projectId, input.studentIds);
      return { enqueued };
    }),
});

// Shared with projects.startElection, which sends invites to every student
// right after minting sign-in codes for the ones that didn't have one yet.
export async function enqueueVotingInvites(projectId: string, studentIds?: string[]) {
  const recipients = await loadStudents(db, projectId, studentIds);
  const missingCode = recipients.filter((s) => !s.signInCode);
  if (missingCode.length > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `${missingCode.length} Schüler:innen haben noch keinen Sign-in-Code.`,
    });
  }

  await getEmailQueue().addBulk(
    recipients.map((student) => ({
      name: EmailJobName.VotingInvite,
      data: { studentId: student.id, projectId },
    })),
  );

  return recipients.length;
}
