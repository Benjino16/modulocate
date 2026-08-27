import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@modulocate/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@modulocate/ui/components/select";
import { Label } from "@modulocate/ui/components/label";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";
import { ResultsStatusBar } from "../components/ResultsStatusBar";

export const Route = createFileRoute("/results/")({
  component: ResultsPage,
});

type ExportSortBy = "title" | "teacher" | "schedule";
type ExportSortDir = "asc" | "desc";

function ResultsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { projects, projectId } = useProject();
  const project = projects.find((p) => p.id === projectId);
  const [error, setError] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<ExportSortBy>("title");
  const [sortDir, setSortDir] = useState<ExportSortDir>("asc");
  const sortQuery = `sortBy=${sortBy}&sortDir=${sortDir}`;

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
        Finaler Lock-In der Zuteilung. PDF-Exporte sind jederzeit möglich; nach dem Versand sind
        die Ergebnisse zusätzlich für Schüler und Lehrkräfte einsehbar.
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
        <div className="mt-4">
          <Button onClick={handleSendResults} disabled={sendVotingResults.isPending}>
            Ergebnisse verschicken
          </Button>
        </div>
      )}

      {project && (
        <div className="mt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="export-sort-by">Sortieren nach</Label>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as ExportSortBy)}>
                <SelectTrigger id="export-sort-by" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title">Modultitel</SelectItem>
                  <SelectItem value="teacher">Lehrkraft</SelectItem>
                  <SelectItem value="schedule">Datum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="export-sort-dir">Reihenfolge</Label>
              <Select value={sortDir} onValueChange={(value) => setSortDir(value as ExportSortDir)}>
                <SelectTrigger id="export-sort-dir" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Aufsteigend</SelectItem>
                  <SelectItem value="desc">Absteigend</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 flex gap-3">
            <Button asChild variant="outline">
              <a href={`/api/projects/${projectId}/exports/attendance-lists.pdf?${sortQuery}`} download>
                Anwesenheitslisten (PDF)
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/projects/${projectId}/exports/participant-lists.pdf?${sortQuery}`} download>
                Teilnehmerlisten (PDF)
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/projects/${projectId}/exports/compact-participant-lists.pdf?${sortQuery}`} download>
                Teilnehmerlisten kompakt (PDF)
              </a>
            </Button>
          </div>
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
