import { useEffect, useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, LogOut } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { trpcClient, useTRPC } from "../trpc";

// Protected: redirects to the fallback login page if there's no valid
// session cookie yet (see planning.md "Locked Decision: Two Separate Auth
// Mechanisms"). Uses the vanilla trpcClient directly since beforeLoad runs
// outside the React tree, before useTRPC's provider is available.
export const Route = createFileRoute("/vote")({
  beforeLoad: async () => {
    const student = await trpcClient.voteAuth.me.query();
    if (!student) throw redirect({ to: "/login" });
  },
  component: VotePage,
});

function VotePage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: modules = [], isLoading: modulesLoading } = useQuery(trpc.vote.eligibleModules.queryOptions());
  const { data: preferences = [], isLoading: preferencesLoading } = useQuery(
    trpc.vote.myPreferences.queryOptions(),
  );
  type Module = (typeof modules)[number];

  // Ranking starts from the student's saved preference order (ranked modules
  // first, in rank order), with any eligible-but-not-yet-ranked modules
  // appended — then lives entirely in local state until submitted, since
  // rank is derived from array position, not stored per drag.
  const [order, setOrder] = useState<Module[] | null>(null);

  useEffect(() => {
    if (order !== null || modulesLoading || preferencesLoading) return;
    const rankedIds = preferences.map((p) => p.moduleId);
    const byId = new Map(modules.map((m) => [m.id, m]));
    const ranked = rankedIds.map((id) => byId.get(id)).filter((m): m is Module => Boolean(m));
    const unranked = modules.filter((m) => !rankedIds.includes(m.id));
    setOrder([...ranked, ...unranked]);
  }, [modules, preferences, modulesLoading, preferencesLoading, order]);

  const submit = useMutation(
    trpc.vote.submitPreferences.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.vote.myPreferences.queryKey() }),
    }),
  );

  const logout = useMutation(
    trpc.voteAuth.logout.mutationOptions({
      onSuccess: () => navigate({ to: "/login" }),
    }),
  );

  function move(index: number, direction: -1 | 1) {
    setOrder((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  if (modulesLoading || preferencesLoading || order === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Module werden geladen…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Deine Modulwahl</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bring die Module in deine Wunschreihenfolge — dein Favorit steht oben.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => logout.mutate()}>
          <LogOut /> Abmelden
        </Button>
      </div>

      {order.length === 0 ? (
        <p className="text-muted-foreground">Für dich sind aktuell keine Module verfügbar.</p>
      ) : (
        <ol className="space-y-2">
          {order.map((module, index) => (
            <li key={module.id} className="flex items-center gap-3 rounded-md border bg-card p-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                {index + 1}
              </span>
              <div className="flex-1">
                <p className="font-medium">{module.name}</p>
                {module.teacher && <p className="text-sm text-muted-foreground">{module.teacher}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Nach oben"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Nach unten"
                  disabled={index === order.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {submit.isSuccess && (
        <p className="rounded-md bg-primary/10 p-3 text-sm text-primary">Deine Wahl wurde gespeichert.</p>
      )}
      {submit.isError && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{submit.error.message}</p>
      )}

      <Button
        className="self-start"
        disabled={order.length === 0 || submit.isPending}
        onClick={() => submit.mutate({ moduleIds: order.map((m) => m.id) })}
      >
        {submit.isPending ? "Wird gespeichert…" : "Wahl abschicken"}
      </Button>
    </div>
  );
}
