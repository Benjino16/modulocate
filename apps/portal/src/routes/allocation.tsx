import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@modulocate/ui/components/button";
import { Input } from "@modulocate/ui/components/input";
import { Label } from "@modulocate/ui/components/label";
import { PhaseLayout } from "../components/PhaseLayout";
import { AllocationRunTile, type AllocationRunSummary } from "../components/AllocationRunTile";
import { AllocationRunDetailDialog } from "../components/AllocationRunDetailDialog";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";

export const Route = createFileRoute("/allocation")({
  component: AllocationPage,
});

const tabs = [{ to: "/allocation", label: "Zuteilung" }];

function AllocationPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { projectId } = useProject();

  const [prioPercent, setPrioPercent] = useState("20");
  const [seed, setSeed] = useState("");
  const [error, setError] = useState<string | undefined>();

  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const [detailOpen, setDetailOpen] = useState(false);

  function openDetail(runId: string) {
    setSelectedRunId(runId);
    setDetailOpen(true);
  }

  const { data: runs, isLoading } = useQuery({
    ...trpc.allocationRuns.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
    // Poll while a run is still computing so the tile flips from "Läuft…" to
    // its result without a manual refresh — otherwise no need to poll.
    refetchInterval: (query) => {
      const data = query.state.data as AllocationRunSummary[] | undefined;
      return data?.some((run) => run.status === "running") ? 2000 : false;
    },
  });

  const startRun = useMutation(
    trpc.allocationRuns.start.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.allocationRuns.list.queryKey({ projectId: projectId! }) });
        setSeed("");
      },
      onError: (err) => setError(err.message),
    }),
  );

  function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    const prioFraction = Number(prioPercent) / 100;
    if (!Number.isFinite(prioFraction) || prioFraction < 0 || prioFraction > 1) {
      return setError("Prio-Anteil muss zwischen 0 und 100 liegen.");
    }

    let parsedSeed: number | undefined;
    if (seed.trim()) {
      parsedSeed = Number(seed);
      if (!Number.isInteger(parsedSeed)) return setError("Seed muss eine ganze Zahl sein.");
    }

    startRun.mutate({ projectId: projectId!, prioPercent: prioFraction, seed: parsedSeed });
  }

  return (
    <PhaseLayout tabs={tabs}>
      <h1 className="text-2xl font-semibold">Zuteilung</h1>
      <p className="mt-1 text-muted-foreground">
        Startet den Allokations-Algorithmus mit verschiedenen Parametern. Mehrere Durchläufe können
        verglichen und anschließend anhand ihrer Kennzahlen ausgewählt werden.
      </p>

      <form onSubmit={handleStart} className="mt-4 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prio-percent">Prio-Anteil (%)</Label>
          <Input
            id="prio-percent"
            type="number"
            min={0}
            max={100}
            className="w-32"
            value={prioPercent}
            onChange={(e) => setPrioPercent(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="seed">Seed (optional)</Label>
          <Input
            id="seed"
            type="number"
            placeholder="zufällig"
            className="w-32"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
        </div>

        <Button type="submit" disabled={!projectId || startRun.isPending}>
          Neuen Durchlauf starten
        </Button>
      </form>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-6">
        {isLoading && <p className="text-muted-foreground">Lade Durchläufe…</p>}
        {!isLoading && !runs?.length && (
          <p className="text-muted-foreground">Noch keine Durchläufe gestartet.</p>
        )}

        {!!runs?.length && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {runs.map((run) => (
              <AllocationRunTile
                key={run.id}
                run={run}
                projectId={projectId!}
                onClick={() => openDetail(run.id)}
              />
            ))}
          </div>
        )}
      </div>

      {projectId && (
        <AllocationRunDetailDialog
          projectId={projectId}
          runId={selectedRunId}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      )}
    </PhaseLayout>
  );
}
