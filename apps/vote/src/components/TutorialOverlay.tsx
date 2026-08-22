import { useState, type ComponentType } from "react";
import { Check, GripVertical, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@modulocate/ui/components/dialog";
import { cn } from "@modulocate/ui/lib/utils";
import { markTutorialSeen } from "../lib/tutorialStorage";
import "./tutorial-overlay.css";

function MockRow({ highlighted, className }: { highlighted?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-11 items-center gap-2 rounded-md border bg-card px-2.5 shadow-sm",
        highlighted && "border-primary/50 bg-primary/5",
        className,
      )}
    >
      <span className={cn("size-5 shrink-0 rounded-full bg-muted", highlighted && "bg-primary")} />
      <span className="flex-1 space-y-1.5">
        <span className="block h-2.5 w-20 rounded-full bg-foreground/70" />
        <span className="block h-2 w-12 rounded-full bg-muted-foreground/40" />
      </span>
      <GripVertical className="size-4 shrink-0 text-muted-foreground/50" />
    </div>
  );
}

function IntroDemo() {
  return (
    <div className="tutorial-breathe flex size-20 items-center justify-center rounded-full bg-primary/10">
      <Sparkles className="size-9 text-primary" />
    </div>
  );
}

function DragDemo() {
  return (
    <div className="flex w-56 flex-col gap-2">
      <MockRow className="tutorial-swap-down" />
      <MockRow />
      <MockRow className="tutorial-swap-up" />
    </div>
  );
}

function PredictedDemo() {
  return (
    <div className="flex w-56 flex-col gap-2">
      <MockRow highlighted className="tutorial-highlight-pulse" />
      <MockRow highlighted className="tutorial-highlight-pulse [animation-delay:0.3s]" />
      <MockRow />
    </div>
  );
}

function WarningDemo() {
  return (
    <div className="tutorial-breathe flex size-20 items-center justify-center rounded-full bg-destructive/10">
      <TriangleAlert className="size-9 text-destructive" />
    </div>
  );
}

function TapDemo() {
  return (
    <div className="flex w-56 flex-col items-center gap-3">
      <div className="relative w-full">
        <MockRow />
        <span className="tutorial-tap-ripple absolute top-1/2 right-9 size-3 rounded-full bg-primary/60" />
      </div>
      <div className="tutorial-tap-panel w-full space-y-1.5 rounded-md border bg-card p-2.5 opacity-0 shadow-sm">
        <span className="block h-2.5 w-16 rounded-full bg-foreground/70" />
        <span className="block h-2 w-full rounded-full bg-muted-foreground/30" />
        <span className="block h-2 w-4/5 rounded-full bg-muted-foreground/30" />
      </div>
    </div>
  );
}

function SubmitDemo() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="tutorial-submit-pulse rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
        Wahl abschicken
      </div>
      <Check className="tutorial-submit-check size-6 text-primary opacity-0" />
    </div>
  );
}

function UpdateDemo() {
  return (
    <div className="flex w-56 flex-col items-center gap-3">
      <div className="flex w-full flex-col gap-2">
        <MockRow className="tutorial-swap-down" />
        <MockRow />
        <MockRow className="tutorial-swap-up" />
      </div>
      <div className="tutorial-submit-pulse rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
        Wahl abschicken
      </div>
    </div>
  );
}

type Step = { title: string; text: string; Demo: ComponentType };

const steps: Step[] = [
  {
    title: "Bevor es losgeht",
    text: "Es folgt eine kurze Einführung in die Modulwahl — schau sie dir am besten aufmerksam an.",
    Demo: IntroDemo,
  },
  {
    title: "Module in Reihenfolge bringen",
    text: "Zieh die Module am Griff-Symbol in deine Wunschreihenfolge — ganz oben stehen deine Favoriten.",
    Demo: DragDemo,
  },
  {
    title: "Deine wahrscheinliche Wahl",
    text: "Module, die du mit dieser Reihenfolge aktuell bekommen würdest, werden hervorgehoben markiert.",
    Demo: PredictedDemo,
  },
  {
    title: "Keine Garantie",
    text: "Deine Reihenfolge ist nur ein Wunsch und garantiert keine Teilnahme. Module werden nach Verfügbarkeit vergeben — beliebte Module können daher schwer zu bekommen sein.",
    Demo: WarningDemo,
  },
  {
    title: "Mehr zu einem Modul erfahren",
    text: "Tippe auf ein Modul, um Details wie Beschreibung, Lehrkraft und Termin zu sehen.",
    Demo: TapDemo,
  },
  {
    title: "Wahl abschicken",
    text: "Erst mit einem Klick auf „Wahl abschicken“ wird deine Reihenfolge gespeichert — das ist der wichtigste Schritt, vergiss ihn nicht!",
    Demo: SubmitDemo,
  },
  {
    title: "Nachträglich ändern",
    text: "Du kannst deine Wahl danach jederzeit wieder umsortieren und einfach erneut auf „Wahl abschicken“ klicken.",
    Demo: UpdateDemo,
  },
];

export function TutorialOverlay({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === steps.length - 1;
  const current = steps[step];

  function finish() {
    markTutorialSeen(studentId);
    onDone();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && finish()}>
      <DialogContent showCloseButton={false} className="w-[min(94vw,420px)] gap-5 overflow-hidden">
        <DialogTitle className="sr-only">Tutorial: {current.title}</DialogTitle>

        <div className="flex justify-center gap-1.5">
          {steps.map((s, i) => (
            <span
              key={s.title}
              className={cn("h-1.5 w-6 rounded-full transition-colors", i === step ? "bg-primary" : "bg-muted")}
            />
          ))}
        </div>

        <div className="flex h-40 items-center justify-center">
          <current.Demo />
        </div>

        <div className="space-y-1 text-center">
          <p className="text-base font-semibold">{current.title}</p>
          <p className="text-sm text-muted-foreground">{current.text}</p>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <Button variant="destructive" size="sm" onClick={finish}>
            Tutorial überspringen
          </Button>
          <Button size="sm" onClick={() => (isLast ? finish() : setStep((s) => s + 1))}>
            {isLast ? "Los geht's" : "Weiter"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
