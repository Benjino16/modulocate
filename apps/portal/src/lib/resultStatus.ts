// Single source of truth for results-send status — only one timestamp exists
// (resultsSentAt is first-send-only, see packages/db/src/schema.ts), so unlike
// voteStatus.ts there are just two states, not four.
export type ResultStatus = "sent" | "none";

export function resolveResultStatus(student: { resultsSentAt: string | null }): ResultStatus {
  return student.resultsSentAt ? "sent" : "none";
}

// Best-to-worst — also the stacking order in ResultsStatusBar.
export const RESULT_STATUS_ORDER: ResultStatus[] = ["sent", "none"];

export const RESULT_STATUS_LABEL: Record<ResultStatus, string> = {
  sent: "Ergebnis erhalten",
  none: "Nicht erhalten",
};

// "none" has no fill of its own — it's the bg-muted track showing through,
// so its swatch below just borrows that.
export const RESULT_STATUS_COLOR: Record<ResultStatus, string> = {
  sent: "bg-green-500",
  none: "bg-muted",
};

// Faint versions of the same colors, for tinting a whole table row instead
// of a solid chart segment. "none" stays untinted — it's the default row.
export const RESULT_STATUS_ROW_COLOR: Record<ResultStatus, string> = {
  sent: "bg-green-500/10",
  none: "",
};

// Worst-to-best — the order the "students" table sorts by, so the students
// needing attention (nothing sent yet) surface at the top.
export const RESULT_STATUS_SORT_ORDER: ResultStatus[] = [...RESULT_STATUS_ORDER].reverse();
