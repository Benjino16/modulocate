import { renderEmailHtml, renderEmailText, htmlToText } from "./layout";

export function votingInviteTemplate(params: { studentName: string; voteLink: string; introHtml?: string }) {
  const bodyHtml = `${params.introHtml ?? ""}<p style="margin:0;">Bitte gib deine Modulwahl ab:</p>`;
  const bodyText = [params.introHtml ? htmlToText(params.introHtml) : "", "Bitte gib deine Modulwahl ab:"]
    .filter(Boolean)
    .join("\n\n");
  const cta = { label: "Jetzt wählen", href: params.voteLink };

  return {
    subject: "Bitte wähle deine Module",
    html: renderEmailHtml({ greetingName: params.studentName, bodyHtml, cta }),
    text: renderEmailText({ greetingName: params.studentName, bodyText, cta }),
  };
}
