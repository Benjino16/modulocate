import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@modulocate/ui/components/button";
import { Input } from "@modulocate/ui/components/input";
import { Label } from "@modulocate/ui/components/label";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  // Populated by better-auth's own redirect: ?token=... on a valid link,
  // ?error=INVALID_TOKEN if the token was already expired/used when clicked.
  validateSearch: (search: Record<string, unknown>): { token?: string; error?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
});

function ResetPasswordPage() {
  const { token, error: linkError } = Route.useSearch();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    if (!token) return;

    setIsSubmitting(true);
    const { error } = await authClient.resetPassword({ newPassword, token });
    setIsSubmitting(false);

    if (error) {
      setError(error.message ?? "Passwort zurücksetzen fehlgeschlagen.");
      return;
    }

    navigate({ to: "/login" });
  }

  const linkInvalid = !token || linkError === "INVALID_TOKEN";

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Neues Passwort festlegen</h1>

        {linkInvalid ? (
          <>
            <p className="text-sm text-destructive">
              Dieser Link ist ungültig oder abgelaufen.
            </p>
            <Link to="/forgot-password" className="text-sm text-muted-foreground hover:underline">
              Neuen Link anfordern
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Wird gespeichert…" : "Passwort speichern"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
