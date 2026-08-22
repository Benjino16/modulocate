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
  const invalidateStudents = () =>
    queryClient.invalidateQueries({ queryKey: trpc.students.list.queryKey({ projectId: projectId! }) });

  const openElection = useMutation(
    trpc.projects.openElection.mutationOptions({
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

  const sendVotingInvites = useMutation(
    trpc.students.sendVotingInvites.mutationOptions({
      onSuccess: invalidateStudents,
      onError: (err) => setError(err.message),
    }),
  );

  async function handleSendEmails() {
    if (!projectId || !project) return;
    setError(undefined);

    const alreadyOpen = project.phase === "voting";
    const confirmed = window.confirm(
      alreadyOpen
        ? "E-Mails mit den Voting-Links erneut an alle Schüler verschicken?"
        : "E-Mails mit den Voting-Links an alle Schüler verschicken? Die Umfrage wird dadurch automatisch geöffnet.",
    );
    if (!confirmed) return;

    try {
      if (!alreadyOpen) {
        await openElection.mutateAsync({ projectId });
      }
      await sendVotingInvites.mutateAsync({ projectId });
    } catch {
      // onError above already recorded the message.
    }
  }

  function handleToggleOpen() {
    if (!projectId || !project) return;
    setError(undefined);

    if (project.phase === "voting") {
      if (
        !window.confirm(
          "Umfrage jetzt schließen? Schüler können danach nicht mehr abstimmen, und das Projekt wechselt in die Zuteilungs-Phase.",
        )
      ) {
        return;
      }
      stopElection.mutate({ projectId });
      return;
    }

    const reopening = project.phase === "allocating" || project.phase === "reviewing";
    const confirmed = window.confirm(
      reopening
        ? "Umfrage erneut öffnen? Der aktuelle Zuteilungsstand (alle Durchläufe und geladenen Zuteilungen) wird dabei gelöscht, da er nach neuen Stimmen nicht mehr gültig ist. Schüler können danach wieder abstimmen."
        : "Umfrage jetzt öffnen? Schüler können danach mit ihrem Voting-Code abstimmen.",
    );
    if (!confirmed) return;
    openElection.mutate({ projectId });
  }

  const canSendEmails = project?.phase === "setup" || project?.phase === "voting";
  const canToggleOpen =
    project?.phase === "setup" ||
    project?.phase === "voting" ||
    project?.phase === "allocating" ||
    project?.phase === "reviewing";
  const isTerminal =
    project?.phase === "published" || project?.phase === "closed" || project?.phase === "finalized";

  return (
    <>
      <h1 className="text-2xl font-semibold">Umfrage</h1>
      <p className="mt-1 text-muted-foreground">
        Öffne die Umfrage, damit Schüler abstimmen können, und verschicke unabhängig davon die E-Mails
        mit den Voting-Links. Beide Schritte lassen sich bei Bedarf wiederholen.
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

      <div className="mt-4 flex gap-3">
        {canSendEmails && (
          <Button
            onClick={handleSendEmails}
            disabled={openElection.isPending || sendVotingInvites.isPending}
          >
            E-Mails verschicken
          </Button>
        )}

        {canToggleOpen && (
          <Button
            variant={project?.phase === "setup" ? "default" : "destructive"}
            onClick={handleToggleOpen}
            disabled={openElection.isPending || stopElection.isPending}
          >
            {project?.phase === "voting" ? "Umfrage schließen" : "Umfrage öffnen"}
          </Button>
        )}
      </div>

      {isTerminal && (
        <p className="mt-4 text-muted-foreground">
          Die Umfrage ist bereits abgeschlossen (Phase: {project?.phase}).
        </p>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
