import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/account-management")({
  component: AccountManagementPage,
});

function AccountManagementPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Account Verwaltung</h1>
      <p className="mt-1 text-muted-foreground">Account-Verwaltung folgt hier.</p>
    </>
  );
}
