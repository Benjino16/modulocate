import { renderEmailHtml, renderEmailText, htmlToText } from "./layout";

export interface VotingResultModule {
  name: string;
  displayScheduleLabel: string | null;
  categoryNames: string[];
  description: string | null;
}

const MUTED_FOREGROUND = "#8c8c8c";
const FOREGROUND = "#252525";
const BORDER = "#e5e5e5";

export function votingResultsTemplate(params: {
  studentName: string;
  modules: VotingResultModule[];
  introHtml?: string;
}) {
  // Numbered manually via a table (number | content per row) rather than
  // <ol>/CSS counters — Outlook strips list-style and counter-based
  // numbering, but table cells always render.
  const rows = params.modules
    .map((module, index) => {
      const meta = [module.displayScheduleLabel, module.categoryNames.join(", ") || null].filter(Boolean).join(" • ");
      const metaHtml = meta
        ? `<div style="font-size:13px;color:${MUTED_FOREGROUND};margin-top:2px;">${meta}</div>`
        : "";
      return `<tr>
        <td style="width:24px;vertical-align:top;padding:0 8px 12px 0;font-size:16px;font-weight:700;color:${FOREGROUND};">${index + 1}.</td>
        <td style="vertical-align:top;padding:0 0 12px 0;">
          <div style="font-size:16px;font-weight:700;color:${FOREGROUND};">${module.name}</div>
          ${metaHtml}
        </td>
      </tr>`;
    })
    .join("");
  const modulesWithDescription = params.modules.filter((module) => module.description);
  const infoBoxes = modulesWithDescription
    .map(
      (module) =>
        `<div style="border:1px solid ${BORDER};border-radius:6px;padding:12px 16px;margin:0 0 12px;">
          <div style="font-size:14px;font-weight:700;color:${FOREGROUND};margin:0 0 6px;">${module.name}</div>
          <div style="font-size:13px;line-height:1.5;color:${FOREGROUND};">${module.description}</div>
        </div>`,
    )
    .join("");
  const infoBoxesHtml =
    modulesWithDescription.length > 0
      ? `<p style="margin:24px 0 8px;font-size:13px;font-weight:700;color:${MUTED_FOREGROUND};">Mehr zu deinen Modulen</p>${infoBoxes}`
      : "";
  const bodyHtml = `${params.introHtml ?? ""}<p style="margin:0 0 8px;">Dir wurden folgende ${params.modules.length} Module zugeteilt:</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${rows}</table>${infoBoxesHtml}`;
  const bodyText = [
    params.introHtml ? htmlToText(params.introHtml) : "",
    `Dir wurden folgende ${params.modules.length} Module zugeteilt:`,
    params.modules
      .map((module, index) => {
        const meta = [module.displayScheduleLabel, module.categoryNames.join(", ") || null].filter(Boolean).join(" • ");
        return meta ? `${index + 1}. ${module.name} (${meta})` : `${index + 1}. ${module.name}`;
      })
      .join("\n"),
    modulesWithDescription.length > 0
      ? [
          "Mehr zu deinen Modulen:",
          modulesWithDescription
            .map((module) => `${module.name}:\n${htmlToText(module.description ?? "")}`)
            .join("\n\n"),
        ].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject: "Deine Modulzuteilung",
    html: renderEmailHtml({ greetingName: params.studentName, bodyHtml }),
    text: renderEmailText({ greetingName: params.studentName, bodyText }),
  };
}
