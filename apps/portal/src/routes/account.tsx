import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@modulocate/ui/components/button";
import { Input } from "@modulocate/ui/components/input";
import { Label } from "@modulocate/ui/components/label";
import { PhaseLayout } from "../components/PhaseLayout";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/account")({
  component: AccountPage,
});

const tabs = [{ to: "/account", label: "Account" }];

function AccountPage() {
  return (
    <PhaseLayout tabs={tabs}>
      <h1 className="text-2xl font-semibold">Account</h1>
      <div className="mt-6 max-w-sm">
        <ChangePasswordForm />
      </div>
    </PhaseLayout>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("Die neuen Passwörter stimmen nicht überein.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setIsSubmitting(false);

    if (error) {
      setError(error.message ?? "Passwort ändern fehlgeschlagen.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccess(true);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Passwort ändern</h2>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current-password">Aktuelles Passwort</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">Neues Passwort</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm-password">Neues Passwort bestätigen</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-success">Passwort wurde geändert.</p>}

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "Wird geändert…" : "Passwort ändern"}
      </Button>
    </form>
  );
}
