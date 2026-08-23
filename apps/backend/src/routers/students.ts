import { randomBytes } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { studentCreateInput, studentUpdateInput } from "@modulocate/shared";
import {
  db,
  rules,
  studentGroups,
  studentInGroup,
  students,
  resolveRuleCompliance,
  resolveStudentModuleOptions,
  resolveStudentPreferences,
} from "@modulocate/db";
import { EmailJobName, getEmailQueue } from "@modulocate/queue";
import { router, staffProcedure } from "../trpc";
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
      voteCodeSentAt: students.voteCodeSentAt,
      voteOpenedAt: students.voteOpenedAt,
      voteSubmittedAt: students.voteSubmittedAt,
      resultsSentAt: students.resultsSentAt,
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

function generateSignInCode(): string {
  return randomBytes(24).toString("base64url");
}

export const studentsRouter = router({
  list: staffProcedure.input(projectScoped).query(({ input }) => loadStudents(db, input.projectId)),

  ruleCompliance: staffProcedure
    .input(projectScoped)
    .query(({ input }) => resolveRuleCompliance(db, { projectId: input.projectId })),

  // Eligible modules for the manual-assignment dialog, each annotated with
  // this student's own preference rank and whether they're already assigned.
  moduleOptions: staffProcedure
    .input(projectScoped.extend({ studentId: z.uuid() }))
    .query(({ input }) => resolveStudentModuleOptions(db, { projectId: input.projectId, studentId: input.studentId })),

  // Raw ranked submission for the Umfrage tab — unlike moduleOptions, not
  // filtered to currently-eligible modules, since this shows what the
  // student actually voted for, not what they could still pick today.
  preferences: staffProcedure
    .input(projectScoped.extend({ studentId: z.uuid() }))
    .query(({ input }) => resolveStudentPreferences(db, { projectId: input.projectId, studentId: input.studentId })),

  get: staffProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .query(async ({ input }) => {
      const [student] = await loadStudents(db, input.projectId, [input.id]);
      if (!student) throw new TRPCError({ code: "NOT_FOUND" });
      return student;
    }),

  create: staffProcedure
    .input(studentCreateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      const { groupId, ...rest } = input;
      return db.transaction(async (tx) => {
        const [student] = await tx
          .insert(students)
          .values({ ...rest, voteStatus: "not_voted", signInCode: generateSignInCode() })
          .returning();
        if (groupId) {
          await tx.insert(studentInGroup).values({ studentId: student.id, groupId, projectId: input.projectId });
        }
        const [full] = await loadStudents(tx, input.projectId, [student.id]);
        return full;
      });
    }),

  update: staffProcedure
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
  remove: staffProcedure
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
  sendVotingInvites: staffProcedure
    .input(projectScoped.extend({ studentIds: z.array(z.uuid()).optional() }))
    .mutation(async ({ input }) => {
      const enqueued = await enqueueVotingInvites(input.projectId, input.studentIds);
      return { enqueued };
    }),

  // Same shape as sendVotingInvites: all students by default, or a single
  // student for a resend from the results "Schüler" tab.
  sendVotingResults: staffProcedure
    .input(projectScoped.extend({ studentIds: z.array(z.uuid()).optional() }))
    .mutation(async ({ input }) => {
      const enqueued = await enqueueVotingResults(input.projectId, input.studentIds);
      return { enqueued };
    }),
});

// Shared with projects.openElection (send-all after opening) and
// students.sendVotingInvites (resend, to all or to one student). Any
// recipient still missing a sign-in code — legacy students created before
// codes were minted at creation time — gets one here, right before the
// invite is queued, so this never fails on a stale/missing code.
export async function enqueueVotingInvites(projectId: string, studentIds?: string[]) {
  const recipients = await db.transaction(async (tx) => {
    const rows = await loadStudents(tx, projectId, studentIds);
    const missingCode = rows.filter((s) => !s.signInCode);
    if (missingCode.length === 0) return rows;
    for (const student of missingCode) {
      await tx.update(students).set({ signInCode: generateSignInCode() }).where(eq(students.id, student.id));
    }
    return loadStudents(tx, projectId, studentIds);
  });

  await getEmailQueue().addBulk(
    recipients.map((student) => ({
      name: EmailJobName.VotingInvite,
      data: { studentId: student.id, projectId },
    })),
  );

  return recipients.length;
}

// Shared with projects.publishResults, which sends every student their final
// module assignment once the allocation is published.
export async function enqueueVotingResults(projectId: string, studentIds?: string[]) {
  const recipients = await loadStudents(db, projectId, studentIds);

  await getEmailQueue().addBulk(
    recipients.map((student) => ({
      name: EmailJobName.VotingResults,
      data: { studentId: student.id, projectId },
    })),
  );

  return recipients.length;
}
