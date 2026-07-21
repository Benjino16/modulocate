import sanitizeHtml from "sanitize-html";

// Mirrors exactly what the portal's tiptap toolbar can produce (H4, bold,
// italic, underline, bullet list) — anything else client-side JS could smuggle
// into the HTML payload (script tags, event handler attributes, style-based
// XSS) is stripped before this ever reaches Postgres.
export function sanitizeModuleDescription(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["h4", "p", "strong", "em", "u", "ul", "li", "br"],
    allowedAttributes: {},
  });
}
