import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PhaseLayout } from "../components/PhaseLayout";

export const Route = createFileRoute("/adjustments")({
  component: AdjustmentsLayout,
});

const tabs = [
  { to: "/adjustments", label: "Anpassungen" },
  { to: "/adjustments/modules", label: "Module" },
  { to: "/adjustments/students", label: "Schüler" },
  { to: "/adjustments/rules", label: "Regeln" },
];

function AdjustmentsLayout() {
  return (
    <PhaseLayout tabs={tabs}>
      <Outlet />
    </PhaseLayout>
  );
}
