import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { LayoutDashboard } from "lucide-react";
import { GithubIcon } from "../components/GithubIcon";
import { translateLoginError } from "../lib/voteErrors";
import { useTRPC } from "../trpc";

// The emailed vote link is /login?code=... — this page auto-consumes that
// code. There's no manual code-entry fallback anymore (see planning.md):
// with no code at all, this is just the plain landing page a student
// shouldn't normally ever see (bookmarked, typo'd, "/" redirect — see
// routes/index.tsx); with a code that turns out not to work, it hands off
// to /login-error instead of rendering inline here.
export const Route = createFileRoute("/login")({
  validateSearch: z.object({ code: z.string().optional() }),
  component: LoginPage,
});

function LoginPage() {
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

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
      onError: (error) => {
        navigate({ to: "/login-error", search: { message: translateLoginError(error) } });
      },
    }),
  );

  useEffect(() => {
    if (code) {
      login.mutate({ code });
    }
    // Only ever run once per mount for the code the link arrived with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (code) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Anmeldung läuft…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">MODULOCATE</h1>
      <p className="text-muted-foreground">
        Die Teilnahme an der Modulwahl ist nur über deinen persönlichen Einladungslink aus der E-Mail möglich.
      </p>
      <p className="text-sm text-muted-foreground">Bei Fragen oder Problemen melde dich bei deiner Schule.</p>

      <div className="fixed inset-x-0 bottom-0 flex items-center justify-center gap-6 border-t bg-background/95 p-4 text-sm text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <a href="/portal/" className="inline-flex items-center gap-1.5 hover:text-foreground">
          <LayoutDashboard className="size-4" /> Admin
        </a>
        <a
          href="https://github.com/Benjino16/modulocate"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 hover:text-foreground"
        >
          <GithubIcon className="size-4" /> GitHub
        </a>
      </div>
    </div>
  );
}
