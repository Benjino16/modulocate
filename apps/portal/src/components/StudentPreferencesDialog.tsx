import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@modulocate/ui/components/dialog";
import { useTRPC } from "../trpc";

type StudentSummary = {
  id: string;
  name: string;
  groupName: string | null;
  ruleName: string | null;
};

export function StudentPreferencesDialog({
  projectId,
  student,
  open,
  onOpenChange,
}: {
  projectId: string;
  student: StudentSummary | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
