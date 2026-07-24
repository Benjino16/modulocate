import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@modulocate/ui/components/button";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";
import { PhaseLayout } from "../components/PhaseLayout";

export const Route = createFileRoute("/results")({
  component: ResultsPage,
});

const tabs = [{ to: "/results", label: "Ergebnisse" }];

function ResultsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { projects, projectId } = useProject();
  const project = projects.find((p) => p.id === projectId);
  const [error, setError] = useState<string | undefined>();

  const publishResults = useMutation(
    trpc.projects.publishResults.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.projects.list.queryKey() }),
      onError: (err) => setError(err.message),
    }),
  );

  function handlePublish() {
    if (!projectId) return;
    setError(undefined);
    if (
      !window.confirm(
        "Ergebnisse jetzt versenden? Die Zuteilung wird damit final gesperrt und jeder Schüler erhält eine E-Mail mit seinen zugeteilten Modulen.",
      )
    ) {
      return;
    }
    publishResults.mutate({ projectId });
  }

  return (
    <PhaseLayout tabs={tabs}>
      <h1 className="text-2xl font-semibold">Ergebnisse</h1>
      <p className="mt-1 text-muted-foreground">
        Finaler Lock-In der Zuteilung. Nach dem Versand sind die Ergebnisse für Schüler und
        Lehrkräfte einsehbar und exportierbar.
      </p>

      {project?.phase === "reviewing" && (
        <Button className="mt-4" onClick={handlePublish} disabled={publishResults.isPending}>
          Ergebnisse versenden
        </Button>
      )}

      {project?.phase === "published" && (
        <p className="mt-4 text-muted-foreground">
          Die Ergebnisse wurden bereits versendet.
        </p>
      )}

      {project && project.phase !== "reviewing" && project.phase !== "published" && (
        <p className="mt-4 text-muted-foreground">
          Die Ergebnisse können erst versendet werden, sobald eine Zuteilung geladen wurde
          (aktuelle Phase: {project.phase}).
        </p>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </PhaseLayout>
  );
}
