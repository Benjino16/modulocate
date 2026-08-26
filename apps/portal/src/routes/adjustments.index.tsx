import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@modulocate/ui/components/button";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";

export const Route = createFileRoute("/adjustments/")({
  component: AdjustmentsPage,
});

function AdjustmentsPage() {
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

  function handleFinalize() {
    if (!projectId) return;
    setError(undefined);

    if (project?.phase === "allocating") {
      if (
        !window.confirm(
          "Achtung: Die Umfrage ist bereits geschlossen, das Projekt befindet sich aber noch in Phase \"Zuteilung\" — der zuletzt geladene Durchlauf wurde vermutlich berechnet, während die Umfrage noch offen war. Seither könnten Schüler neu abgestimmt haben, wodurch die geladene Zuteilung veraltet wäre. Trotzdem fortfahren?",
        )
      ) {
        return;
      }
    }

    if (
      !window.confirm(
        "Zuteilung jetzt finalisieren? Die Ergebnisse werden damit gesperrt. Der Versand an die Schüler erfolgt separat auf der Ergebnisse-Seite.",
      )
    ) {
      return;
    }
    publishResults.mutate({ projectId });
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Anpassungen</h1>
      <p className="mt-1 text-muted-foreground">
        Letzte manuelle Korrekturen am Zuteilungs-Ergebnis, z.B. Schüler ohne vollständige
        Zuteilung händisch nachtragen. Die Modul-Auslastung findet sich im Tab „Module“.
      </p>

      {(project?.phase === "reviewing" || project?.phase === "allocating") && (
        <Button className="mt-4" onClick={handleFinalize} disabled={publishResults.isPending}>
          Finalisieren
        </Button>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
