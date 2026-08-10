import { sendPasswordResetEmail } from "@modulocate/mailer";
import type { PasswordResetJob } from "@modulocate/queue";

export async function processPasswordReset(data: PasswordResetJob) {
  await sendPasswordResetEmail({ to: data.email, resetLink: data.resetLink });
  return { recipient: data.email, userId: data.userId };
}
