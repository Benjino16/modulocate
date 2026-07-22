import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/adjustments/")({
  component: AdjustmentsPage,
});

function AdjustmentsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Anpassungen</h1>
      <p className="mt-1 text-muted-foreground">
        Letzte manuelle Korrekturen am Zuteilungs-Ergebnis, z.B. Schüler ohne vollständige
        Zuteilung händisch nachtragen. Die Modul-Auslastung findet sich im Tab „Module“.
      </p>
    </>
  );
}
