import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PhaseLayout } from "../components/PhaseLayout";

export const Route = createFileRoute("/results")({
  component: ResultsLayout,
});

const tabs = [
  { to: "/results", label: "Ergebnisse" },
  { to: "/results/students", label: "Schüler" },
];

function ResultsLayout() {
  return (
    <PhaseLayout tabs={tabs}>
      <Outlet />
    </PhaseLayout>
  );
}
