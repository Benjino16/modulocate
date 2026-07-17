import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@modulocate/ui/components/button";
import { PhaseLayout } from "../components/PhaseLayout";

export const Route = createFileRoute("/allocation")({
  component: AllocationPage,
});

const tabs = [{ to: "/allocation", label: "Zuteilung" }];

function AllocationPage() {
  return (
    <PhaseLayout tabs={tabs}>
      <h1 className="text-2xl font-semibold">Zuteilung</h1>
      <p className="mt-1 text-muted-foreground">
        Startet den Allokations-Algorithmus mit verschiedenen Parametern. Mehrere Durchläufe
        können verglichen und anschließend anhand von Tags ausgewählt werden.
      </p>
      <Button className="mt-4">Neuen Durchlauf starten</Button>
    </PhaseLayout>
  );
}
