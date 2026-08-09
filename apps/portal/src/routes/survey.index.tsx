import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@modulocate/ui/components/button";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";
import { SurveyStatusBar } from "../components/SurveyStatusBar";

export const Route = createFileRoute("/survey/")({
  component: SurveyPage,
});

function SurveyPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { projects, projectId } = useProject();
  const project = projects.find((p) => p.id === projectId);
  const [error, setError] = useState<string | undefined>();

  const { data: students } = useQuery({
    ...trpc.students.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const invalidateProjects = () =>
    queryClient.invalidateQueries({ queryKey: trpc.projects.list.queryKey() });

  const startElection = useMutation(
    trpc.projects.startElection.mutationOptions({
      onSuccess: invalidateProjects,
      onError: (err) => setError(err.message),
    }),
  );

  const stopElection = useMutation(
    trpc.projects.stopElection.mutationOptions({
      onSuccess: invalidateProjects,
      onError: (err) => setError(err.message),
    }),
  );

  function handleStart() {
    if (!projectId) return;
    setError(undefined);
    if (
      !window.confirm(
        "Umfrage jetzt öffnen? Dadurch werden automatisch E-Mails mit den Voting-Links an alle Schüler verschickt.",
      )
    ) {
      return;
    }
    startElection.mutate({ projectId });
  }

  function handleStop() {
    if (!projectId) return;
    setError(undefined);
    if (
      !window.confirm(
        "Umfrage jetzt schließen? Schüler können danach nicht mehr abstimmen, und das Projekt wechselt in die Zuteilungs-Phase.",
      )
    ) {
      return;
    }
    stopElection.mutate({ projectId });
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Umfrage</h1>
      <p className="mt-1 text-muted-foreground">
        Startet die Wahl und verschickt die Vote-Links an alle Schüler. Danach sind die Module
        gesperrt, bis die Umfrage wieder geschlossen wird.
      </p>

      {!!students?.length && (
        <div className="mt-6">
          <Link
            to="/survey/students"
            className="block rounded-lg p-3 -m-3 transition-colors hover:bg-muted/50"
          >
            <SurveyStatusBar students={students} />
          </Link>
        </div>
      )}

      {project?.phase === "setup" && (
        <Button className="mt-4" onClick={handleStart} disabled={startElection.isPending}>
          Umfrage starten
        </Button>
      )}

      {project?.phase === "voting" && (
        <Button
          className="mt-4"
          variant="destructive"
          onClick={handleStop}
          disabled={stopElection.isPending}
        >
          Umfrage stoppen
        </Button>
      )}

      {project && project.phase !== "setup" && project.phase !== "voting" && (
        <p className="mt-4 text-muted-foreground">
          Die Umfrage ist bereits abgeschlossen (Phase: {project.phase}).
        </p>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
