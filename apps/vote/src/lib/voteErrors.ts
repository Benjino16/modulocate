import type { TRPCClientErrorLike } from "@trpc/client";
import type { AppRouter } from "@modulocate/backend/router";

type VoteApiError = TRPCClientErrorLike<AppRouter>;

export type TranslatedError = {
  message: string;
  // Only "UNAUTHORIZED" needs a distinct call to action (re-login) — every
  // other known code already carries a friendly, German message from the
  // backend that's fine to show as-is.
  requiresLogin: boolean;
};

// Shared by both callers below: the backend already answers
// BAD_REQUEST/PRECONDITION_FAILED/UNAUTHORIZED with a friendly, contextual
// German message (see vote.ts, voteAuth.ts, trpc.ts), so those pass through
// as-is. A missing `code` means the request never reached the server
// (offline, DNS, CORS, …) — not something the backend can word for us.
function backendMessageOrFallback(error: VoteApiError): string {
  const code = error.data?.code;
  if (code === "BAD_REQUEST" || code === "PRECONDITION_FAILED" || code === "UNAUTHORIZED") {
    return error.message;
  }
  if (!code) {
    return "Verbindung zum Server fehlgeschlagen. Bitte überprüfe deine Internetverbindung und versuche es erneut.";
  }
  return "Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es erneut.";
}

// submitPreferences' UNAUTHORIZED means the session cookie itself expired or
// vanished mid-survey (see trpc.ts) — the backend has no student-facing copy
// for that, so it's translated here instead, with a CTA back to /login.
export function translateSubmitError(error: VoteApiError): TranslatedError {
  if (error.data?.code === "UNAUTHORIZED") {
    return { message: "Deine Sitzung ist abgelaufen oder ungültig. Bitte melde dich erneut an.", requiresLogin: true };
  }
  return { message: backendMessageOrFallback(error), requiresLogin: false };
}

// voteAuth.login's UNAUTHORIZED means the code itself was never valid
// ("Ungültiger Link.") — a different situation from translateSubmitError's,
// but the backend's own message already says exactly that, so no override
// needed here.
export function translateLoginError(error: VoteApiError): string {
  return backendMessageOrFallback(error);
}

// The vote page's own queries (eligibleModules/myPreferences/welcomeText)
// are gated by protectedStudentProcedure, which answers with
// PRECONDITION_FAILED the moment the election closes — even though the
// session cookie itself (checked separately via voteAuth.me, a public
// procedure) is still perfectly valid. That's a definitive server answer,
// not a transient hiccup, so retrying it can only delay the inevitable —
// see the `retry` option on those queries in routes/vote.tsx.
export function shouldRetryVoteQuery(failureCount: number, error: VoteApiError): boolean {
  return !error.data?.code && failureCount < 2;
}
