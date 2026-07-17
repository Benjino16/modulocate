import { eq } from "drizzle-orm";
import { db, modules, studentInModule } from "@modulocate/db";
import { sendVotingResultsEmail } from "@modulocate/mailer";
import type { VotingResultsJob } from "@modulocate/queue";
import { loadStudent } from "./common";

export async function processVotingResults(data: VotingResultsJob) {
  const student = await loadStudent(data.studentId);
  const assigned = await db
    .select({ name: modules.name })
    .from(studentInModule)
    .innerJoin(modules, eq(modules.id, studentInModule.moduleId))
    .where(eq(studentInModule.studentId, student.id));

  await sendVotingResultsEmail({
    to: student.email,
    studentName: student.name,
    moduleNames: assigned.map((m) => m.name),
  });
  return { recipient: student.email, studentId: student.id, projectId: student.projectId };
}
