import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@modulocate/ui/components/button";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";
import { ResultsStatusBar } from "../components/ResultsStatusBar";

export const Route = createFileRoute("/results/")({
  component: ResultsPage,
});

function ResultsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { projects, projectId } = useProject();
  const project = projects.find((p) => p.id === projectId);
  const [error, setError] = useState<string | undefined>();

  const { data: students } = useQuery({
    ...trpc.students.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const sendVotingResults = useMutation(
    trpc.students.sendVotingResults.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.students.list.queryKey({ projectId: projectId! }) }),
      onError: (err) => setError(err.message),
    }),
  );

  function handleSendResults() {
    if (!projectId) return;
    setError(undefined);
    if (!window.confirm("Ergebnisse jetzt an alle Schüler versenden?")) return;
    sendVotingResults.mutate({ projectId });
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Ergebnisse</h1>
      <p className="mt-1 text-muted-foreground">
        Finaler Lock-In der Zuteilung. Nach dem Versand sind die Ergebnisse für Schüler und
        Lehrkräfte einsehbar und exportierbar.
      </p>

      {project?.phase === "published" && !!students?.length && (
        <div className="mt-6">
          <Link
            to="/results/students"
            className="block rounded-lg p-3 -m-3 transition-colors hover:bg-muted/50"
          >
            <ResultsStatusBar students={students} />
          </Link>
        </div>
      )}

      {project?.phase === "published" && (
        <div className="mt-4 flex gap-3">
          <Button onClick={handleSendResults} disabled={sendVotingResults.isPending}>
            Ergebnisse verschicken
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/projects/${projectId}/exports/attendance-lists.pdf`} download>
              Anwesenheitslisten (PDF)
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/projects/${projectId}/exports/participant-lists.pdf`} download>
              Teilnehmerlisten (PDF)
            </a>
          </Button>
        </div>
      )}

      {project?.phase === "reviewing" && (
        <p className="mt-4 text-muted-foreground">
          Die Zuteilung muss zuerst im Tab „Anpassungen" finalisiert werden, bevor die Ergebnisse
          verschickt werden können.
        </p>
      )}

      {project && project.phase !== "reviewing" && project.phase !== "published" && (
        <p className="mt-4 text-muted-foreground">
          Die Ergebnisse können erst versendet werden, sobald eine Zuteilung geladen und
          finalisiert wurde (aktuelle Phase: {project.phase}).
        </p>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
