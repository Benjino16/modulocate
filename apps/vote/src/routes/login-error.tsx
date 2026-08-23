import { CircleX } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Landed on from /login whenever the code in the URL turns out not to work
// (unknown code, or the survey it belongs to isn't in its voting phase right
// now) — see login.tsx. `message` carries the backend's own, already
// German/friendly explanation (translateLoginError in lib/voteErrors.ts);
// the fallback below only covers someone opening this route with no message
// at all (e.g. a stale bookmark).
export const Route = createFileRoute("/login-error")({
  validateSearch: z.object({ message: z.string().optional() }),
  component: LoginErrorPage,
});

function LoginErrorPage() {
  const { message } = Route.useSearch();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <CircleX className="size-12 text-destructive" />
      <h1 className="text-2xl font-semibold">Zugang nicht möglich</h1>
      <p className="text-muted-foreground">{message ?? "Dieser Link ist ungültig oder abgelaufen."}</p>
      <p className="text-sm text-muted-foreground">
        Bitte nutze den persönlichen Einladungslink aus deiner E-Mail. Solltest du weiterhin Probleme haben, wende
        dich an deine Schule.
      </p>
    </div>
  );
}
