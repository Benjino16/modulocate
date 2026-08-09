import { sendVotingInviteEmail } from "@modulocate/mailer";
import type { VotingInviteJob } from "@modulocate/queue";
import { loadStudent } from "./common";

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
  await sendVotingInviteEmail({
    to: student.email,
    studentName: student.name,
    voteLink: `${VOTE_APP_URL}/login?code=${student.signInCode}`,
  });
  return { recipient: student.email, studentId: student.id, projectId: student.projectId };
}
