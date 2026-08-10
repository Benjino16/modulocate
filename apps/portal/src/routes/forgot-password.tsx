import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@modulocate/ui/components/button";
import { Input } from "@modulocate/ui/components/input";
import { Label } from "@modulocate/ui/components/label";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Shown regardless of outcome — better-auth itself never reveals whether
  // the address is registered, so the UI shouldn't either.
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    // Absolute from domain root, not router-relative: better-auth sends this
    // straight to the browser as a Location header, bypassing the router
    // entirely — so it needs the /portal prefix Traefik routes under (see
    // infra/traefik/dynamic.yml), same as vite.config.ts's base and
    // main.tsx's router basepath.
    await authClient.requestPasswordReset({ email, redirectTo: "/portal/reset-password" });
    setIsSubmitting(false);
    setSubmitted(true);
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Passwort vergessen</h1>

        {submitted ? (
          <p className="text-sm text-muted-foreground">
            Falls diese E-Mail-Adresse registriert ist, wurde eine E-Mail mit einem Link zum
            Zurücksetzen des Passworts verschickt.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Wird gesendet…" : "Link zum Zurücksetzen senden"}
            </Button>
          </form>
        )}

        <Link to="/login" className="text-sm text-muted-foreground hover:underline">
          Zurück zur Anmeldung
        </Link>
      </div>
    </div>
  );
}
