import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@modulocate/ui/components/button";
import { Input } from "@modulocate/ui/components/input";
import { Label } from "@modulocate/ui/components/label";
import { useTRPC } from "../trpc";

export const Route = createFileRoute("/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
  const trpc = useTRPC();
  const [testEmail, setTestEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState(false);

  const sendTestMail = useMutation(
    trpc.mail.sendTest.mutationOptions({
      onSuccess: () => setSuccess(true),
      onError: (err) => setError(err.message),
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSuccess(false);
    sendTestMail.mutate({ to: testEmail.trim() });
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Einstellungen</h1>
      <p className="mt-1 text-muted-foreground">
        Diese Einstellungen gelten global für alle Projekte.
      </p>

      <div className="mt-6 max-w-md rounded-lg border p-4">
        <h2 className="text-sm font-semibold">SMTP-Verbindung testen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Verschickt eine Test-E-Mail über die konfigurierte SMTP-Verbindung.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="test-email">E-Mail-Adresse</Label>
            <Input
              id="test-email"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="empfaenger@beispiel.de"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && !error && (
            <p className="text-sm text-emerald-600">Test-E-Mail wurde verschickt.</p>
          )}

          <Button type="submit" disabled={sendTestMail.isPending} className="self-start">
            Test-E-Mail senden
          </Button>
        </form>
      </div>
    </>
  );
}
