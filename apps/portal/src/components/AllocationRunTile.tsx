import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, TriangleAlert } from "lucide-react";
import { useTRPC } from "../trpc";

export type AllocationRunSummary = {
  id: string;
  projectId: string;
  createdAt: string;
  status: "running" | "completed" | "failed";
  config: { prioPercent: number; seed: number };
  error?: string;
  metrics?: {
    score: number;
    unassignedCount: number;
    ruleViolationCount: number;
    belowMinCapacityCount: number;
  };
};

export function AllocationRunTile({
  run,
  projectId,
  onClick,
}: {
  run: AllocationRunSummary;
  projectId: string;
  onClick: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const removeRun = useMutation(
    trpc.allocationRuns.remove.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.allocationRuns.list.queryKey({ projectId }) }),
    }),
  );

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("Diesen Durchlauf wirklich löschen?")) return;
    removeRun.mutate({ id: run.id, projectId });
  }

  const startedAt = new Date(run.createdAt);
  const title = `${startedAt.toLocaleDateString("de-DE")} · ${startedAt.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  return (
    // Not a <button> — it contains the nested delete <button>, and buttons
    // can't nest. role="button" + keyboard handling keeps it accessible.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="relative flex cursor-pointer flex-col gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
    >
      <button
        type="button"
        onClick={handleDelete}
        disabled={removeRun.isPending}
        aria-label="Durchlauf löschen"
        className="absolute top-2 right-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
      >
        <Trash2 className="size-4" />
      </button>

      <div className="pr-8">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">
          Prio-Anteil: {Math.round(run.config.prioPercent * 100)}%
        </p>
      </div>

      {run.status === "running" && (
        <p className="text-sm text-muted-foreground">Läuft…</p>
      )}

      {run.status === "failed" && (
        <p className="text-sm text-destructive">Fehlgeschlagen{run.error ? `: ${run.error}` : ""}</p>
      )}

      {run.status === "completed" && run.metrics && (
        <>
          {(run.metrics.unassignedCount > 0 ||
            run.metrics.ruleViolationCount > 0 ||
            run.metrics.belowMinCapacityCount > 0) && (
            <div className="flex flex-col gap-1">
              {run.metrics.unassignedCount > 0 && (
                <Warning count={run.metrics.unassignedCount} label="ohne vollständige Zuteilung" />
              )}
              {run.metrics.ruleViolationCount > 0 && (
                <Warning count={run.metrics.ruleViolationCount} label="Regelverstöße" />
              )}
              {run.metrics.belowMinCapacityCount > 0 && (
                <Warning count={run.metrics.belowMinCapacityCount} label="Module unter Mindestbelegung" />
              )}
            </div>
          )}

          <p className="text-sm font-medium">Score: {run.metrics.score.toFixed(1)}</p>
        </>
      )}
    </div>
  );
}

function Warning({ count, label }: { count: number; label: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-500">
      <TriangleAlert className="size-4 shrink-0" />
      {count} {label}
    </p>
  );
}
