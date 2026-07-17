import { createFileRoute } from "@tanstack/react-router";
import { PhaseLayout } from "../components/PhaseLayout";

export const Route = createFileRoute("/adjustments")({
  component: AdjustmentsPage,
});

const tabs = [{ to: "/adjustments", label: "Anpassungen" }];

function AdjustmentsPage() {
  return (
    <PhaseLayout tabs={tabs}>
      <h1 className="text-2xl font-semibold">Anpassungen</h1>
      <p className="mt-1 text-muted-foreground">
        Letzte manuelle Korrekturen am Zuteilungs-Ergebnis, z.B. Schüler ohne vollständige
        Zuteilung händisch nachtragen. Analyse-Ansichten zur Modul-Auslastung folgen hier.
      </p>
    </PhaseLayout>
  );
}
