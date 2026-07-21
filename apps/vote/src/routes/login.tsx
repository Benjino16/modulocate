import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@modulocate/ui/components/button";
import { Input } from "@modulocate/ui/components/input";
import { Label } from "@modulocate/ui/components/label";
import { useTRPC } from "../trpc";

// The emailed vote link is /login?code=... (see
// apps/worker/src/processors/votingInvite.ts) — this page both auto-consumes
// that code and, since it never expires, doubles as the fallback page a
// student can visit directly to type the code in by hand.
export const Route = createFileRoute("/login")({
  validateSearch: z.object({ code: z.string().optional() }),
  component: LoginPage,
});

function LoginPage() {
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [manualCode, setManualCode] = useState("");
  // Starts true whenever a code arrives via the URL, so the spinner shows
  // instead of the form until that one attempt resolves either way.
  const [autoLoginInFlight, setAutoLoginInFlight] = useState(Boolean(code));

  const login = useMutation(
    trpc.voteAuth.login.mutationOptions({
      onSuccess: () => {
        // The query cache is shared across the whole SPA session, so a
        // previous student's cached identity (and anything keyed off it,
        // e.g. the vote page's localStorage cache lookup) must not leak
        // into a different student logging in on the same device/tab.
        queryClient.removeQueries({ queryKey: trpc.voteAuth.me.queryKey() });
        navigate({ to: "/vote" });
      },
      onError: () => setAutoLoginInFlight(false),
    }),
  );

  useEffect(() => {
    if (code) login.mutate({ code });
    // Only ever run once per mount for the code the link arrived with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (autoLoginInFlight) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Anmeldung läuft…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Modulwahl</h1>
          <p className="text-sm text-muted-foreground">
            Gib den Zugangscode aus deiner E-Mail ein, um zu deiner Wahl zu gelangen.
          </p>
        </div>

        {code && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Der Link ist ungültig. Bitte gib deinen Zugangscode manuell ein.
          </p>
        )}

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate({ code: manualCode.trim() });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="code">Zugangscode</Label>
            <Input
              id="code"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="z. B. AB12CD34"
              autoFocus
            />
          </div>

          {!code && login.isError && (
            <p className="text-sm text-destructive">Ungültiger Code. Bitte überprüfe deine Eingabe.</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={login.isPending || manualCode.trim().length === 0}
          >
            {login.isPending ? "Wird geprüft…" : "Anmelden"}
          </Button>
        </form>
      </div>
    </div>
  );
}
