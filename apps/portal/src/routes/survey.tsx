import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@modulocate/ui/components/button";
import { PhaseLayout } from "../components/PhaseLayout";

export const Route = createFileRoute("/survey")({
  component: SurveyPage,
});

const tabs = [{ to: "/survey", label: "Umfrage" }];

function SurveyPage() {
  return (
    <PhaseLayout tabs={tabs}>
      <h1 className="text-2xl font-semibold">Umfrage</h1>
      <p className="mt-1 text-muted-foreground">
        Startet die Wahl und verschickt die Vote-Links an alle Schüler. Danach sind die Module
        gesperrt, bis die Umfrage wieder geschlossen wird.
      </p>
      <Button className="mt-4">Umfrage starten</Button>
    </PhaseLayout>
  );
}
