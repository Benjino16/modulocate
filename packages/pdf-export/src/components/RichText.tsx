import React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";

// Renders the small set of tags sanitizeRichText allows (h4, p, strong, em,
// u, ul, li, br — see apps/backend/src/lib/sanitize.ts) since react-pdf has
// no HTML renderer of its own: `<Text>`/`<View>` need actual React elements,
// not markup. Block tags (h4/p/ul) never nest inside each other under that
// whitelist, so a single non-greedy regex pass finds them all; only the
// inline tags (strong/em/u/br) can nest inside a block, handled by
// `parseInlineTokens` below via a running bold/italic/underline flag toggle.

type InlineToken = { text: string; bold: boolean; italic: boolean; underline: boolean } | { break: true };

const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (entity) => ENTITY_MAP[entity] ?? entity);
}

function parseInlineTokens(html: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const tagRegex = /<(\/?)(strong|em|u|br)\s*\/?>/gi;
  let bold = false;
  let italic = false;
  let underline = false;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html))) {
    const text = html.slice(lastIndex, match.index);
    if (text) tokens.push({ text: decodeEntities(text), bold, italic, underline });
    const [, closing, tag] = match;
    if (tag === "br") tokens.push({ break: true });
    else if (tag === "strong") bold = !closing;
    else if (tag === "em") italic = !closing;
    else if (tag === "u") underline = !closing;
    lastIndex = tagRegex.lastIndex;
  }
  const rest = html.slice(lastIndex);
  if (rest) tokens.push({ text: decodeEntities(rest), bold, italic, underline });
  return tokens;
}

type RichTextBlock =
  | { type: "heading"; tokens: InlineToken[] }
  | { type: "paragraph"; tokens: InlineToken[] }
  | { type: "list"; items: InlineToken[][] };

function parseRichTextBlocks(html: string): RichTextBlock[] {
  const blocks: RichTextBlock[] = [];
  const blockRegex = /<(h4|p|ul)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(html))) {
    const [, tag, inner] = match;
    if (tag === "ul") {
      const items: InlineToken[][] = [];
      const liRegex = /<li>([\s\S]*?)<\/li>/gi;
      let liMatch: RegExpExecArray | null;
      while ((liMatch = liRegex.exec(inner))) items.push(parseInlineTokens(liMatch[1]));
      blocks.push({ type: "list", items });
    } else {
      blocks.push({ type: tag === "h4" ? "heading" : "paragraph", tokens: parseInlineTokens(inner) });
    }
  }
  return blocks;
}

const styles = StyleSheet.create({
  heading: { fontSize: 11, fontWeight: 700, marginBottom: 3 },
  paragraph: { fontSize: 9, lineHeight: 1.4, marginBottom: 4 },
  list: { marginBottom: 4 },
  listItem: { flexDirection: "row", marginBottom: 1 },
  bullet: { width: 10, fontSize: 9 },
  listItemText: { flex: 1, fontSize: 9, lineHeight: 1.4 },
});

function InlineTokens({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, index) =>
        "break" in token ? (
          "\n"
        ) : (
          <Text
            key={index}
            style={{
              fontWeight: token.bold ? 700 : 400,
              fontStyle: token.italic ? "italic" : "normal",
              textDecoration: token.underline ? "underline" : "none",
            }}
          >
            {token.text}
          </Text>
        ),
      )}
    </>
  );
}

export function RichText({ html }: { html: string }) {
  const blocks = parseRichTextBlocks(html);
  return (
    <View>
      {blocks.map((block, index) => {
        if (block.type === "list") {
          return (
            <View key={index} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={itemIndex} style={styles.listItem}>
                  <Text style={styles.bullet}>{"•"}</Text>
                  <Text style={styles.listItemText}>
                    <InlineTokens tokens={item} />
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={index} style={block.type === "heading" ? styles.heading : styles.paragraph}>
            <InlineTokens tokens={block.tokens} />
          </Text>
        );
      })}
    </View>
  );
}
