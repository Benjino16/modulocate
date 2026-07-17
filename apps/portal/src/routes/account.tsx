import { createFileRoute } from "@tanstack/react-router";
import { PhaseLayout } from "../components/PhaseLayout";

export const Route = createFileRoute("/account")({
  component: AccountPage,
});

const tabs = [{ to: "/account", label: "Account" }];

function AccountPage() {
  return (
    <PhaseLayout tabs={tabs}>
      <h1 className="text-2xl font-semibold">Account</h1>
      <p className="mt-1 text-muted-foreground">Account-Einstellungen folgen hier.</p>
    </PhaseLayout>
  );
}
