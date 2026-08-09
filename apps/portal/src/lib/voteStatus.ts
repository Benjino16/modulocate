// Single source of truth for the "how far did this student get" precedence —
// a better status always wins, regardless of how many emails were sent or
// how many times the vote link was opened.
export type VoteStatus = "submitted" | "opened" | "sent" | "none";

export function resolveVoteStatus(student: {
  voteSubmittedAt: string | null;
  voteOpenedAt: string | null;
  voteCodeSentAt: string | null;
}): VoteStatus {
  if (student.voteSubmittedAt) return "submitted";
  if (student.voteOpenedAt) return "opened";
  if (student.voteCodeSentAt) return "sent";
  return "none";
}

// Best-to-worst — also the stacking order in SurveyStatusBar.
export const VOTE_STATUS_ORDER: VoteStatus[] = ["submitted", "opened", "sent", "none"];

export const VOTE_STATUS_LABEL: Record<VoteStatus, string> = {
  submitted: "Abgestimmt",
  opened: "Umfrage geöffnet",
  sent: "Mail erhalten",
  none: "Nicht erhalten",
};

// "none" has no fill of its own — it's the bg-muted track showing through,
// so its swatch below just borrows that.
export const VOTE_STATUS_COLOR: Record<VoteStatus, string> = {
  submitted: "bg-green-500",
  opened: "bg-amber-500",
  sent: "bg-gray-500 dark:bg-gray-400",
  none: "bg-muted",
};

// Faint versions of the same colors, for tinting a whole table row instead
// of a solid chart segment. "none" stays untinted — it's the default row.
export const VOTE_STATUS_ROW_COLOR: Record<VoteStatus, string> = {
  submitted: "bg-green-500/10",
  opened: "bg-amber-500/10",
  sent: "bg-gray-500/10 dark:bg-gray-400/10",
  none: "",
};

// Worst-to-best — the order the "students" table sorts by, so the students
// needing attention (nothing sent yet) surface at the top.
export const VOTE_STATUS_SORT_ORDER: VoteStatus[] = [...VOTE_STATUS_ORDER].reverse();
