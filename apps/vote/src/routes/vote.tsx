import { useEffect, useMemo, useState } from "react";
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
import { Check, HelpCircle, LogOut } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { cn } from "@modulocate/ui/lib/utils";
import { GreetingScreen } from "../components/GreetingScreen";
import { IntroScreen } from "../components/IntroScreen";
import { ModuleInfoDialog } from "../components/ModuleInfoDialog";
import { SortableModuleRow } from "../components/SortableModuleRow";
import { SubmitResultDialog, type SubmitResult } from "../components/SubmitResultDialog";
import { TutorialOverlay } from "../components/TutorialOverlay";
import { hasSeenIntro, markIntroSeen } from "../lib/introStorage";
import { simulateOwnAllocation } from "../lib/simulateAllocation";
import { hasSeenTutorial } from "../lib/tutorialStorage";
import { translateSubmitError } from "../lib/voteErrors";
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
  const { data: eligibleData, isLoading: modulesLoading } = useQuery(trpc.vote.eligibleModules.queryOptions());
  // Stable identity across renders (not a fresh `?? []` array each time) so
  // effects/memos keyed on it don't fire spuriously.
  const modules = useMemo(() => eligibleData?.modules ?? [], [eligibleData]);
  const rule = eligibleData?.rule ?? null;
  const { data: preferences = [], isLoading: preferencesLoading } = useQuery(
    trpc.vote.myPreferences.queryOptions(),
  );
  const { data: welcomeText, isLoading: welcomeTextLoading } = useQuery(trpc.vote.welcomeText.queryOptions());
  type Module = (typeof modules)[number];

  // The greeting + welcome/rule screens show once per student — tracked in
  // localStorage keyed by studentId (see lib/introStorage.ts), not tied to
  // the browser session or tab. That's deliberate: a reload or a reopened
  // link before the student ever reaches the survey must show them again
  // (a session-only flag can't survive a browser restart, and the session
  // cookie itself lasts 7 days — far longer), and a shared computer — e.g.
  // a school computer room where students take the survey back to back on
  // the same machine — must never let one student's progress skip or hide
  // another's screens. Derived purely from data (no Effect needed): null
  // until `student` is known; the "reached the survey" effect below is what
  // marks it seen, and only fires once introStep has already been pinned to
  // "survey" via introStepOverride (see below), so recomputing this after
  // that point can't un-render anything still gated on it.
  const showIntro = useMemo(() => {
    if (!student) return null;
    return !hasSeenIntro(student.studentId);
  }, [student]);

  // The very first screen — "Hallo {Name}" with a start/logout choice —
  // shown as soon as `student` is known, deliberately not gated on the
  // module/welcomeText/preferences queries so it never waits on them.
  const [greetingDismissed, setGreetingDismissed] = useState(false);

  // Pre-survey gate: welcome text, then the student's rule text, each its own
  // full page (not a dialog) — a step is skipped entirely when there's no
  // text to show for it. Derived purely from data (no Effect needed): null
  // while the queries it depends on are still loading, so the survey never
  // flashes before a step it should've shown. Once the student clicks
  // "Weiter" (introStepOverride below), that click always wins over
  // whatever this recomputes to afterward.
  const initialIntroStep = useMemo<"welcome" | "rules" | "survey" | null>(() => {
    if (!showIntro) return "survey";
    if (modulesLoading || welcomeTextLoading) return null;
    if (welcomeText) return "welcome";
    if (rule?.description) return "rules";
    return "survey";
  }, [showIntro, modulesLoading, welcomeTextLoading, welcomeText, rule]);
  const [introStepOverride, setIntroStepOverride] = useState<"welcome" | "rules" | "survey" | null>(null);
  const introStep = introStepOverride ?? initialIntroStep;

  // Only now — greeting dismissed and past whichever of welcome/rules
  // applied — has the student actually reached the survey, so only now is
  // the intro marked seen for this student. Idempotent (markIntroSeen is a
  // no-op once the key is already set), so re-running this on every render
  // after that point is harmless.
  useEffect(() => {
    if (showIntro && greetingDismissed && introStep === "survey" && student) {
      markIntroSeen(student.studentId);
    }
  }, [showIntro, greetingDismissed, introStep, student]);

  // Ranking starts from the student's saved preference order (ranked modules
  // first, in rank order), with any eligible-but-not-yet-ranked modules
  // appended. Derived purely from data (no Effect needed): once the student
  // starts dragging (orderOverride below, set from handleDragEnd), that
  // local edit always wins over whatever this recomputes to afterward (e.g.
  // a background refetch of `preferences`).
  const baseOrder = useMemo<Module[] | null>(() => {
    if (modulesLoading || preferencesLoading) return null;
    const rankedIds = preferences.map((p) => p.moduleId);
    const byId = new Map(modules.map((m) => [m.id, m]));
    const ranked = rankedIds.map((id) => byId.get(id)).filter((m): m is Module => Boolean(m));
    const unranked = modules.filter((m) => !rankedIds.includes(m.id));
    return [...ranked, ...unranked];
  }, [modules, preferences, modulesLoading, preferencesLoading]);
  const [orderOverride, setOrderOverride] = useState<Module[] | null>(null);
  const order = orderOverride ?? baseOrder;

  const [infoModule, setInfoModule] = useState<Module | null>(null);
  // Overrides the localStorage read once a submit succeeds in this session,
  // so the button reflects it immediately without a storage round-trip.
  const [submittedOverride, setSubmittedOverride] = useState<string[] | null>(null);
  const cachedOrder = student ? (submittedOverride ?? readCachedOrder(student.studentId)) : null;

  // Auto-opening the tutorial is tied to the same per-student condition as
  // the greeting/welcome/rule screens (see showIntro above) — a student who
  // already finished the intro shouldn't have it replayed uninvited.
  // Derived purely from data (no Effect needed): the help-icon button's
  // manual reopen and the tutorial's own "done" callback (tutorialOverride
  // below) always win over this recomputing.
  const autoTutorialOpen = useMemo(() => {
    if (!student) return null;
    return showIntro && !hasSeenTutorial(student.studentId);
  }, [student, showIntro]);
  const [tutorialOverride, setTutorialOverride] = useState<boolean | null>(null);
  const tutorialOpen = tutorialOverride ?? autoTutorialOpen;

  // "What would I get, assuming no competition from other students" —
  // recomputed locally on every reorder, no network round-trip (see
  // simulateAllocation.ts). Skipped entirely if the student has no effective
  // rule (misconfiguration case handled server-side by eligibleModules).
  const predictedModuleIds = useMemo(() => {
    if (!student || !rule || order === null) return new Set<string>();
    const result = simulateOwnAllocation(
      student.studentId,
      order.map((m) => m.id),
      modules,
      rule,
    );
    return new Set(result.assignments.map((a) => a.moduleId));
  }, [student, rule, modules, order]);

  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const submit = useMutation(
    trpc.vote.submitPreferences.mutationOptions({
      onSuccess: (_result, variables) => {
        queryClient.invalidateQueries({ queryKey: trpc.vote.myPreferences.queryKey() });
        if (student) {
          localStorage.setItem(cacheKey(student.studentId), JSON.stringify(variables.moduleIds));
          setSubmittedOverride(variables.moduleIds);
        }
        setSubmitResult({ status: "success" });
      },
      onError: (error) => {
        setSubmitResult({ status: "error", ...translateSubmitError(error) });
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

  // No activation distance: the grip handle (touch-none, its own listeners)
  // is a dedicated drag control, not shared with the row's tap-to-open-info
  // click, so there's nothing here for a movement threshold to disambiguate
  // — it only made the handle feel laggy on pickup.
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !order) return;
    const oldIndex = order.findIndex((m) => m.id === active.id);
    const newIndex = order.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setOrderOverride(arrayMove(order, oldIndex, newIndex));
  }

  if (!student || showIntro === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Wird geladen…</p>
      </div>
    );
  }

  if (showIntro && !greetingDismissed) {
    return (
      <GreetingScreen
        name={student.name}
        hasVoted={student.hasVoted}
        onStart={() => setGreetingDismissed(true)}
        onLogout={() => logout.mutate()}
      />
    );
  }

  if (modulesLoading || preferencesLoading || welcomeTextLoading || order === null || (showIntro && introStep === null)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Module werden geladen…</p>
      </div>
    );
  }

  if (showIntro && introStep === "welcome") {
    return (
      <IntroScreen
        title="Willkommen"
        html={welcomeText ?? ""}
        buttonLabel="Weiter"
        onContinue={() => setIntroStepOverride(rule?.description ? "rules" : "survey")}
      />
    );
  }

  if (showIntro && introStep === "rules" && rule?.description) {
    return (
      <IntroScreen
        title={rule.name}
        html={rule.description}
        buttonLabel="Weiter"
        onContinue={() => setIntroStepOverride("survey")}
      />
    );
  }

  const currentIds = order.map((m) => m.id);
  const alreadySubmitted = cachedOrder !== null && sameOrder(cachedOrder, currentIds);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 pb-28">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{student.name} – Modulwahl</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bring die Module in deine Wunschreihenfolge, deine Favoriten stehen oben.
          </p>
          {predictedModuleIds.size > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Hervorgehobene Module würdest du mit dieser Reihenfolge bekommen — angenommen, es gäbe keine
              Konkurrenz durch andere Schüler:innen.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Tutorial erneut anzeigen"
            onClick={() => setTutorialOverride(true)}
          >
            <HelpCircle />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => logout.mutate()}>
            <LogOut /> Abmelden
          </Button>
        </div>
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
                  isPredicted={predictedModuleIds.has(module.id)}
                  onOpenInfo={() => setInfoModule(module)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center border-t bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button
          size="lg"
          className={cn(
            "w-full max-w-sm text-base",
            alreadySubmitted && "bg-success text-success-foreground hover:bg-success/90",
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

      <SubmitResultDialog
        result={submitResult}
        onOpenChange={(open) => !open && setSubmitResult(null)}
        onLoginClick={() => navigate({ to: "/login" })}
      />

      {student && tutorialOpen && (
        <TutorialOverlay studentId={student.studentId} onDone={() => setTutorialOverride(false)} />
      )}
    </div>
  );
}
