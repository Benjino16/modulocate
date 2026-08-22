import { sendVotingInviteEmail } from "@modulocate/mailer";
import type { VotingInviteJob } from "@modulocate/queue";
import { loadStudent, loadSetting } from "./common";

const VOTE_APP_URL: string =
  process.env.VOTE_APP_URL ||
  (() => {
    throw new Error("VOTE_APP_URL is not set");
  })();

export async function processVotingInvite(data: VotingInviteJob) {
  const student = await loadStudent(data.studentId);
  if (!student.signInCode) {
    throw new Error(`Student ${student.id} has no sign-in code`);
  }
  const introHtml = await loadSetting(data.projectId, "votingInviteIntro");
  const recipients = [student.email, student.email2].filter((email): email is string => !!email);
  await sendVotingInviteEmail({
    to: recipients,
    studentName: student.name,
    voteLink: `${VOTE_APP_URL}/login?code=${student.signInCode}`,
    introHtml,
  });
  return { recipient: recipients.join(", "), studentId: student.id, projectId: student.projectId };
}
