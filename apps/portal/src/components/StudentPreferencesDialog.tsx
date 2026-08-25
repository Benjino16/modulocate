import { useQuery } from "@tanstack/react-query";
import { Copy, Link2, Mail, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@modulocate/ui/components/dialog";
import { useTRPC } from "../trpc";
import { CopyButton } from "./CopyButton";

// Portal and vote are same-origin behind Traefik (path-routed to /portal and
// /voting — see compose.dev.yaml, compose.yaml), so this can just use the page's own
// origin instead of hardcoding a host.
const VOTE_APP_URL = `${window.location.origin}/voting`;

type StudentSummary = {
  id: string;
  name: string;
  groupName: string | null;
  ruleName: string | null;
  signInCode: string | null;
};

export function StudentPreferencesDialog({
  projectId,
  student,
  open,
  onOpenChange,
  onResend,
  onRegenerate,
}: {
  projectId: string;
  student: StudentSummary | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResend: () => void;
  onRegenerate: () => void;
}) {
  const trpc = useTRPC();

  const { data: preferences, isLoading } = useQuery({
    ...trpc.students.preferences.queryOptions({ projectId, studentId: student?.id ?? "" }),
    enabled: open && !!student,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{student?.name}</DialogTitle>
        </DialogHeader>

        <p className="-mt-2 text-sm text-muted-foreground">
          {student?.groupName || "Keine Klasse"} · {student?.ruleName || "Keine Regel zugewiesen"}
        </p>

        <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
          <span className="font-mono text-sm">{student?.signInCode ?? "Kein Code"}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRegenerate}
              title="Neuen Voting-Code erzeugen"
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <RefreshCw className="size-3.5" />
            </button>
            {student?.signInCode && (
              <>
                <CopyButton value={student.signInCode} label="Code kopieren" icon={Copy} />
                <CopyButton
                  value={`${VOTE_APP_URL}/login?code=${student.signInCode}`}
                  label="Voting-Link kopieren"
                  icon={Link2}
                />
                <button
                  type="button"
                  onClick={onResend}
                  title="Voting-Code erneut zusenden"
                  className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <Mail className="size-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {isLoading && <p className="text-muted-foreground">Lade Präferenzen…</p>}
        {!isLoading && !preferences?.length && (
          <div className="flex min-h-40 items-center justify-center">
            <p className="text-muted-foreground">Noch keine Wahl eingereicht.</p>
          </div>
        )}

        {!!preferences?.length && (
          <ul className="flex flex-col gap-1">
            {preferences.map((pref) => (
              <li key={pref.moduleId} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">
                  {pref.preference}.
                </span>
                <span className="truncate font-medium">{pref.moduleName}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
