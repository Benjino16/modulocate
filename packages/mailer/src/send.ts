import { getTransport, getMailFrom } from "./transport";

export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendMailResult {
  messageId: string;
}

export async function sendMail(params: SendMailParams): Promise<SendMailResult> {
  const info = await getTransport().sendMail({
    from: getMailFrom(),
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
  return { messageId: info.messageId };
}
