import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PhaseLayout } from "../components/PhaseLayout";

export const Route = createFileRoute("/allocation")({
  component: AllocationLayout,
});

const tabs = [
  { to: "/allocation", label: "Zuteilung" },
  { to: "/allocation/students", label: "Schüler" },
];

function AllocationLayout() {
  return (
    <PhaseLayout tabs={tabs}>
      <Outlet />
    </PhaseLayout>
  );
}
