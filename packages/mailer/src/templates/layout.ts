// Shared shell for voting-invite/voting-results emails: a centered card
// matching the app's grayscale design tokens (packages/ui/src/styles/globals.css),
// built with table markup + inline styles only (no <style> block, no CSS
// layout) since that's what survives stripping in Outlook/Gmail/etc.
const COLORS = {
  primary: "#1c1c1c",
  primaryForeground: "#fafafa",
  background: "#ffffff",
  pageBackground: "#f5f5f5",
  foreground: "#252525",
  mutedForeground: "#8c8c8c",
  border: "#e5e5e5",
};

const FONT_STACK =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface EmailLayoutParams {
  greetingName: string;
  bodyHtml: string;
  cta?: { label: string; href: string };
}

export function renderEmailHtml({ greetingName, bodyHtml, cta }: EmailLayoutParams): string {
  // No plain-text URL shown below the button on purpose: the link carries a
  // pre-signed voting code, and a visible URL invites accidental copy/forward.
  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
                  <tr>
                    <td bgcolor="${COLORS.primary}" style="border-radius:6px;">
                      <a href="${cta.href}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${FONT_STACK};font-size:15px;font-weight:600;color:${COLORS.primaryForeground};text-decoration:none;border-radius:6px;">${cta.label}</a>
                    </td>
                  </tr>
                </table>`
    : "";

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>modulocate</title>
  </head>
  <body style="margin:0;padding:0;background-color:${COLORS.pageBackground};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.pageBackground};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background-color:${COLORS.background};border:1px solid ${COLORS.border};border-radius:8px;">
            <tr>
              <td style="padding:32px;font-family:${FONT_STACK};">
                <p style="margin:0 0 24px;font-size:13px;font-weight:700;letter-spacing:0.04em;color:${COLORS.primary};text-transform:uppercase;">modulocate</p>
                <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${COLORS.foreground};">Hallo ${greetingName},</h1>
                <div style="font-size:15px;line-height:1.5;color:${COLORS.foreground};">${bodyHtml}</div>
                ${ctaHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export interface EmailTextParams {
  greetingName: string;
  bodyText: string;
  cta?: { label: string; href: string };
}

export function renderEmailText({ greetingName, bodyText, cta }: EmailTextParams): string {
  const parts = [`Hallo ${greetingName},`, "", bodyText];
  if (cta) {
    parts.push("", `${cta.label}: ${cta.href}`);
  }
  return parts.join("\n");
}

// Converts the small set of tags sanitizeRichText allows (h4, p, strong, em,
// u, ul, li, br) into plain text for the multipart/alternative fallback.
export function htmlToText(html: string): string {
  return html
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h4|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
