import { sendMail } from "./send";
import { testEmailTemplate } from "./templates/testEmail";
import { votingInviteTemplate } from "./templates/votingInvite";
import { votingResultsTemplate, type VotingResultModule } from "./templates/votingResults";
import { passwordResetTemplate } from "./templates/passwordReset";

export type { VotingResultModule };

export async function sendTestEmail(to: string) {
  const { subject, html } = testEmailTemplate();
  return sendMail({ to, subject, html });
}

export async function sendVotingInviteEmail(params: {
  to: string | string[];
  studentName: string;
  voteLink: string;
  introHtml?: string;
}) {
  const { subject, html, text } = votingInviteTemplate(params);
  return sendMail({ to: params.to, subject, html, text });
}

export async function sendVotingResultsEmail(params: {
  to: string | string[];
  studentName: string;
  modules: VotingResultModule[];
  introHtml?: string;
}) {
  const { subject, html, text } = votingResultsTemplate(params);
  return sendMail({ to: params.to, subject, html, text });
}

export async function sendPasswordResetEmail(params: { to: string; resetLink: string }) {
  const { subject, html } = passwordResetTemplate(params);
  return sendMail({ to: params.to, subject, html });
}
