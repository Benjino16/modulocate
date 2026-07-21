import { useEffect, useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Check, LogOut } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { cn } from "@modulocate/ui/lib/utils";
import { ModuleInfoDialog } from "../components/ModuleInfoDialog";
import { SortableModuleRow } from "../components/SortableModuleRow";
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

function cacheKey(studentId: string) {
  return `modulocate:vote:submitted:${studentId}`;
}

function readCachedOrder(studentId: string): string[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(studentId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sameOrder(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function VotePage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: student } = useQuery(trpc.voteAuth.me.queryOptions());
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
  const [infoModule, setInfoModule] = useState<Module | null>(null);
  // Overrides the localStorage read once a submit succeeds in this session,
  // so the button reflects it immediately without a storage round-trip.
  const [submittedOverride, setSubmittedOverride] = useState<string[] | null>(null);
  const cachedOrder = student ? (submittedOverride ?? readCachedOrder(student.studentId)) : null;

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
      onSuccess: (_result, variables) => {
        queryClient.invalidateQueries({ queryKey: trpc.vote.myPreferences.queryKey() });
        if (student) {
          localStorage.setItem(cacheKey(student.studentId), JSON.stringify(variables.moduleIds));
          setSubmittedOverride(variables.moduleIds);
        }
      },
    }),
  );

  const logout = useMutation(
    trpc.voteAuth.logout.mutationOptions({
      onSuccess: () => {
        // Same reasoning as the login flow: drop the cached identity so the
        // next student on this device/tab never sees a stale studentId.
        queryClient.removeQueries({ queryKey: trpc.voteAuth.me.queryKey() });
        navigate({ to: "/login" });
      },
    }),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((current) => {
      if (!current) return current;
      const oldIndex = current.findIndex((m) => m.id === active.id);
      const newIndex = current.findIndex((m) => m.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  if (modulesLoading || preferencesLoading || order === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Module werden geladen…</p>
      </div>
    );
  }

  const currentIds = order.map((m) => m.id);
  const alreadySubmitted = cachedOrder !== null && sameOrder(cachedOrder, currentIds);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 pb-28">
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={currentIds} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2">
              {order.map((module, index) => (
                <SortableModuleRow
                  key={module.id}
                  module={module}
                  rank={index + 1}
                  onOpenInfo={() => setInfoModule(module)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {submit.isError && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {submit.error.message}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center border-t bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button
          size="lg"
          className={cn(
            "w-full max-w-sm text-base",
            alreadySubmitted && "bg-green-600 text-white hover:bg-green-600/90",
          )}
          disabled={order.length === 0 || submit.isPending}
          onClick={() => submit.mutate({ moduleIds: currentIds })}
        >
          {submit.isPending ? (
            "Wird gespeichert…"
          ) : alreadySubmitted ? (
            <>
              <Check /> Erfolgreich eingereicht
            </>
          ) : cachedOrder !== null ? (
            "Wahl aktualisieren"
          ) : (
            "Wahl abschicken"
          )}
        </Button>
      </div>

      <ModuleInfoDialog module={infoModule} onOpenChange={(open) => !open && setInfoModule(null)} />
    </div>
  );
}
