import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PhaseLayout } from "../components/PhaseLayout";

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
});

const tabs = [
  { to: "/settings", label: "Einstellungen" },
  { to: "/settings/account-management", label: "Account Verwaltung" },
];

function SettingsLayout() {
  return (
    <PhaseLayout tabs={tabs}>
      <Outlet />
    </PhaseLayout>
  );
}
