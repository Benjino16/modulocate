import { cn } from "@modulocate/ui/lib/utils";
import {
  resolveVoteStatus,
  VOTE_STATUS_COLOR,
  VOTE_STATUS_LABEL,
  VOTE_STATUS_ORDER,
  type VoteStatus,
} from "../lib/voteStatus";

type StatusInput = {
  voteSubmittedAt: string | null;
  voteOpenedAt: string | null;
  voteCodeSentAt: string | null;
};

export function SurveyStatusBar({ students }: { students: StatusInput[] }) {
  const total = students.length;
  const counts: Record<VoteStatus, number> = { submitted: 0, opened: 0, sent: 0, none: 0 };
  for (const student of students) counts[resolveVoteStatus(student)]++;

  // "none" isn't rendered as its own segment — it's the bg-muted track
  // showing through the gap left by the other three, so the bar reads as
  // "progress fills in from the left" rather than four competing blocks.
  const fillStatuses = VOTE_STATUS_ORDER.filter((status) => status !== "none");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-8 w-full gap-0.5 overflow-hidden rounded-lg bg-muted">
        {total > 0 &&
          fillStatuses.map((status) => {
            const percent = (counts[status] / total) * 100;
            if (percent === 0) return null;
            return (
              <div
                key={status}
                className={cn("h-full", VOTE_STATUS_COLOR[status])}
                style={{ width: `${percent}%` }}
                title={`${VOTE_STATUS_LABEL[status]}: ${counts[status]} (${percent.toFixed(0)}%)`}
              />
            );
          })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
        {VOTE_STATUS_ORDER.map((status) => {
          const percent = total > 0 ? (counts[status] / total) * 100 : 0;
          return (
            <span key={status} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  VOTE_STATUS_COLOR[status],
                  status === "none" && "border border-border",
                )}
              />
              {VOTE_STATUS_LABEL[status]} · {counts[status]} ({percent.toFixed(0)}%)
            </span>
          );
        })}
      </div>
    </div>
  );
}
