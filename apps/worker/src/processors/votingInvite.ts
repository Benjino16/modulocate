import { sendVotingInviteEmail } from "@modulocate/mailer";
import type { VotingInviteJob } from "@modulocate/queue";
import { loadStudent } from "./common";

// Vote app isn't deployed yet — set once it has a real URL.
const VOTE_APP_URL = process.env.VOTE_APP_URL ?? "http://localhost:5174";

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
