import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@modulocate/ui/components/dialog";
import { useTRPC } from "../trpc";

type UnassignedIssue = { type: "unassigned"; detail: string; studentId: string; studentName: string };
type RuleViolationIssue = { type: "rule_violation"; detail: string; studentId: string; studentName: string };
type BelowMinCapacityIssue = { type: "below_min_capacity"; detail: string; moduleId: string; moduleName: string };
type AllocationIssueDetail = UnassignedIssue | RuleViolationIssue | BelowMinCapacityIssue;

export function AllocationRunDetailDialog({
  projectId,
  runId,
  open,
  onOpenChange,
}: {
  projectId: string;
  runId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: run, isLoading } = useQuery({
    ...trpc.allocationRuns.get.queryOptions({ projectId, id: runId! }),
    enabled: open && !!runId,
  });

  const loadRun = useMutation(
    trpc.allocationRuns.load.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.allocationRuns.list.queryKey({ projectId }) });
        onOpenChange(false);
      },
    }),
  );

  function handleLoad() {
    if (!runId) return;
    const confirmed = window.confirm(
      "Diesen Durchlauf in die Datenbank laden? Die aktuelle Zuteilung wird dabei vollständig überschrieben — bereits vorgenommene manuelle Änderungen gehen verloren.",
    );
    if (!confirmed) return;
    loadRun.mutate({ projectId, id: runId });
  }

  const issues = (run?.issues ?? []) as AllocationIssueDetail[];
  const unassigned = issues.filter((issue): issue is UnassignedIssue => issue.type === "unassigned");
  const ruleViolations = issues.filter((issue): issue is RuleViolationIssue => issue.type === "rule_violation");
  const belowMinCapacity = issues.filter(
    (issue): issue is BelowMinCapacityIssue => issue.type === "below_min_capacity",
  );

  const startedAt = run ? new Date(run.createdAt) : undefined;
  const title = startedAt
    ? `${startedAt.toLocaleDateString("de-DE")} · ${startedAt.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : "Durchlauf";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {isLoading && <p className="text-muted-foreground">Lade Details…</p>}

        {run && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Prio-Anteil: {Math.round(run.config.prioPercent * 100)}% · Seed: {run.config.seed}
            </p>

            {run.status === "running" && <p className="text-sm text-muted-foreground">Läuft…</p>}
            {run.status === "failed" && (
              <p className="text-sm text-destructive">Fehlgeschlagen{run.error ? `: ${run.error}` : ""}</p>
            )}

            {run.status === "completed" && run.metrics && (
              <>
                <IssueGroup title="Ohne vollständige Zuteilung" issues={unassigned} name={(i) => i.studentName} />
                <IssueGroup title="Regelverstöße" issues={ruleViolations} name={(i) => i.studentName} />
                <IssueGroup
                  title="Module unter Mindestbelegung"
                  issues={belowMinCapacity}
                  name={(i) => i.moduleName}
                />

                <p className="text-sm font-medium">Score: {run.metrics.score.toFixed(1)}</p>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleLoad} disabled={!run || run.status !== "completed" || loadRun.isPending}>
            In Datenbank laden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueGroup<T extends { detail: string }>({
  title,
  issues,
  name,
}: {
  title: string;
  issues: T[];
  name: (issue: T) => string;
}) {
  if (issues.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-500">
        <TriangleAlert className="size-4 shrink-0" />
        {title} ({issues.length})
      </p>
      <ul className="flex flex-col gap-1 pl-6 text-sm">
        {issues.map((issue, i) => (
          <li key={i} className="list-disc text-muted-foreground">
            <span className="text-foreground">{name(issue)}</span> — {issue.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
