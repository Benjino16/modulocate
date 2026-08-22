import { eq } from "drizzle-orm";
import { db, modules, studentInModule } from "@modulocate/db";
import { sendVotingResultsEmail } from "@modulocate/mailer";
import type { VotingResultsJob } from "@modulocate/queue";
import { loadStudent, loadSetting } from "./common";

export async function processVotingResults(data: VotingResultsJob) {
  const student = await loadStudent(data.studentId);
  const assigned = await db
    .select({ name: modules.name })
    .from(studentInModule)
    .innerJoin(modules, eq(modules.id, studentInModule.moduleId))
    .where(eq(studentInModule.studentId, student.id));
  const introHtml = await loadSetting(data.projectId, "votingResultsIntro");
  const recipients = [student.email, student.email2].filter((email): email is string => !!email);

  await sendVotingResultsEmail({
    to: recipients,
    studentName: student.name,
    moduleNames: assigned.map((m) => m.name),
    introHtml,
  });
  return { recipient: recipients.join(", "), studentId: student.id, projectId: student.projectId };
}
