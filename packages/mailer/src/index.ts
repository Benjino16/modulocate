import { sendMail } from "./send";
import { testEmailTemplate } from "./templates/testEmail";
import { votingInviteTemplate } from "./templates/votingInvite";
import { votingResultsTemplate } from "./templates/votingResults";
import { passwordResetTemplate } from "./templates/passwordReset";

export async function sendTestEmail(to: string) {
  const { subject, html } = testEmailTemplate();
  return sendMail({ to, subject, html });
}

export async function sendVotingInviteEmail(params: { to: string; studentName: string; voteLink: string }) {
  const { subject, html } = votingInviteTemplate(params);
  return sendMail({ to: params.to, subject, html });
}

export async function sendVotingResultsEmail(params: {
  to: string;
  studentName: string;
  moduleNames: string[];
}) {
  const { subject, html } = votingResultsTemplate(params);
  return sendMail({ to: params.to, subject, html });
}

export async function sendPasswordResetEmail(params: { to: string; resetLink: string }) {
  const { subject, html } = passwordResetTemplate(params);
  return sendMail({ to: params.to, subject, html });
}
