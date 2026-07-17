import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PhaseLayout } from "../components/PhaseLayout";

export const Route = createFileRoute("/data")({
  component: DataLayout,
});

const tabs = [
  { to: "/data/modules", label: "Module" },
  { to: "/data/categories", label: "Kategorien" },
  { to: "/data/dates", label: "Termine" },
  { to: "/data/students", label: "Schüler" },
  { to: "/data/rules", label: "Regeln" },
  { to: "/data/groups", label: "Gruppen" },
];

function DataLayout() {
  return (
    <PhaseLayout tabs={tabs}>
      <Outlet />
    </PhaseLayout>
  );
}
