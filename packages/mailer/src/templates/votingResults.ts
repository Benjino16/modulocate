import { renderEmailHtml, renderEmailText, htmlToText } from "./layout";

export function votingResultsTemplate(params: { studentName: string; moduleNames: string[]; introHtml?: string }) {
  const list = params.moduleNames.map((name) => `<li>${name}</li>`).join("");
  const bodyHtml = `${params.introHtml ?? ""}<p style="margin:0 0 8px;">Dir wurden folgende Module zugeteilt:</p><ul style="margin:0;padding-left:20px;">${list}</ul>`;
  const bodyText = [
    params.introHtml ? htmlToText(params.introHtml) : "",
    "Dir wurden folgende Module zugeteilt:",
    params.moduleNames.map((name) => `- ${name}`).join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject: "Deine Modulzuteilung",
    html: renderEmailHtml({ greetingName: params.studentName, bodyHtml }),
    text: renderEmailText({ greetingName: params.studentName, bodyText }),
  };
}
