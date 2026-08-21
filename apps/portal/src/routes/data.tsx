import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PhaseLayout } from "../components/PhaseLayout";

export const Route = createFileRoute("/data")({
  component: DataLayout,
});

const tabs = [
  { to: "/data", label: "Übersicht" },
  { to: "/data/modules", label: "Module" },
  { to: "/data/categories", label: "Kategorien" },
  { to: "/data/dates", label: "Termine" },
  { to: "/data/students", label: "Schüler" },
  { to: "/data/rules", label: "Regeln" },
  { to: "/data/groups", label: "Gruppen" },
  { to: "/data/settings", label: "Einstellungen" },
];

function DataLayout() {
  return (
    <PhaseLayout tabs={tabs}>
      <Outlet />
    </PhaseLayout>
  );
}
