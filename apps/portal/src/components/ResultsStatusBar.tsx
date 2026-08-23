import { cn } from "@modulocate/ui/lib/utils";
import {
  resolveResultStatus,
  RESULT_STATUS_COLOR,
  RESULT_STATUS_LABEL,
  RESULT_STATUS_ORDER,
  type ResultStatus,
} from "../lib/resultStatus";

type StatusInput = {
  resultsSentAt: string | null;
};

export function ResultsStatusBar({ students }: { students: StatusInput[] }) {
  const total = students.length;
  const counts: Record<ResultStatus, number> = { sent: 0, none: 0 };
  for (const student of students) counts[resolveResultStatus(student)]++;

  // "none" isn't rendered as its own segment — it's the bg-muted track
  // showing through the gap left by "sent", so the bar reads as "progress
  // fills in from the left" rather than two competing blocks.
  const fillStatuses = RESULT_STATUS_ORDER.filter((status) => status !== "none");

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
                className={cn("h-full", RESULT_STATUS_COLOR[status])}
                style={{ width: `${percent}%` }}
                title={`${RESULT_STATUS_LABEL[status]}: ${counts[status]} (${percent.toFixed(0)}%)`}
              />
            );
          })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
        {RESULT_STATUS_ORDER.map((status) => {
          const percent = total > 0 ? (counts[status] / total) * 100 : 0;
          return (
            <span key={status} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  RESULT_STATUS_COLOR[status],
                  status === "none" && "border border-border",
                )}
              />
              {RESULT_STATUS_LABEL[status]} · {counts[status]} ({percent.toFixed(0)}%)
            </span>
          );
        })}
      </div>
    </div>
  );
}
