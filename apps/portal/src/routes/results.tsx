import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@modulocate/ui/components/button";
import { PhaseLayout } from "../components/PhaseLayout";

export const Route = createFileRoute("/results")({
  component: ResultsPage,
});

const tabs = [{ to: "/results", label: "Ergebnisse" }];

function ResultsPage() {
  return (
    <PhaseLayout tabs={tabs}>
      <h1 className="text-2xl font-semibold">Ergebnisse</h1>
      <p className="mt-1 text-muted-foreground">
        Finaler Lock-In der Zuteilung. Nach dem Versand sind die Ergebnisse für Schüler und
        Lehrkräfte einsehbar und exportierbar.
      </p>
      <Button className="mt-4">Ergebnisse versenden</Button>
    </PhaseLayout>
  );
}
