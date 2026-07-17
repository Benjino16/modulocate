import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | undefined;

// Read lazily (not at import time) so both backend and worker can import this
// module before their own dotenv/config has run.
export function getTransport(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

export function getMailFrom(): string {
  return process.env.MAIL_FROM ?? "Modulocate <no-reply@modulocate.local>";
}
