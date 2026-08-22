import { Button } from "@modulocate/ui/components/button";
import "./greeting-screen.css";

// The very first thing a student sees after logging in — its own full page,
// same reasoning as IntroScreen (welcome/rule text), before anything else
// (including the module data) has to finish loading. The staggered
// entrance (see greeting-screen.css) is purely a first-impression flourish —
// nothing here depends on it having finished.
export function GreetingScreen({
  name,
  hasVoted,
  onStart,
  onLogout,
}: {
  name: string;
  hasVoted: boolean;
  onStart: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-4xl font-bold">
        <span className="greeting-eyebrow block">{hasVoted ? "Willkommen zurück" : "Willkommen"}</span>
        <span className="greeting-name block">{name}</span>
      </h1>

      {hasVoted && (
        <p className="greeting-subtext text-sm text-muted-foreground">
          Deine eingereichte Wahl wird wiederhergestellt.
        </p>
      )}

      <div className="greeting-actions flex flex-col items-center gap-6">
        <Button size="lg" className="w-full max-w-sm text-base" onClick={onStart}>
          Wahl starten
        </Button>

        <div className="mt-2 flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">Das bist nicht du?</p>
          <Button size="lg" variant="outline" className="w-full max-w-sm text-base" onClick={onLogout}>
            Abmelden
          </Button>
        </div>
      </div>
    </div>
  );
}
