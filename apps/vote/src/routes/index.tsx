import { createFileRoute, redirect } from "@tanstack/react-router";

// Students always arrive via a link that already carries an access code
// (see planning.md "Locked Decision: Two Separate Auth Mechanisms") — "/" is
// only ever hit directly (bookmarked, typo'd, etc.), so it just forwards to
// the fallback login/code-entry page.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
