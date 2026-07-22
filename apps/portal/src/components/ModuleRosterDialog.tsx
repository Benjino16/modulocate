import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@modulocate/ui/components/dialog";
import { useTRPC } from "../trpc";
import { CapacityBar } from "./CapacityBar";

type ModuleSummary = {
  id: string;
  name: string;
  teacher: string | null;
  scheduleLabel: string | null;
  min: number;
  max: number;
};

export function ModuleRosterDialog({
  projectId,
  module,
  open,
  onOpenChange,
}: {
  projectId: string;
  module: ModuleSummary | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: roster, isLoading } = useQuery({
    ...trpc.modules.roster.queryOptions({ projectId, moduleId: module?.id ?? "" }),
    enabled: open && !!module,
  });

  const removeStudent = useMutation(
    trpc.modules.removeStudent.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.modules.roster.queryKey({ projectId, moduleId: module!.id }),
        });
        queryClient.invalidateQueries({ queryKey: trpc.modules.list.queryKey({ projectId }) });
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{module?.name}</DialogTitle>
        </DialogHeader>

        <p className="-mt-2 text-sm text-muted-foreground">
          {module?.scheduleLabel || "Kein Termin festgelegt"} · {module?.teacher || "Kein Lehrer zugeteilt"}
        </p>

        {module && !isLoading && (
          <CapacityBar studentCount={roster?.length ?? 0} min={module.min} max={module.max} />
        )}

        {isLoading && <p className="text-muted-foreground">Lade Schüler…</p>}
        {!isLoading && !roster?.length && (
          <p className="text-muted-foreground">Noch keine Schüler zugewiesen.</p>
        )}

        {!!roster?.length && (
          <ul className="flex flex-col">
            {roster.map((student) => (
              <li
                key={student.studentId}
                className="flex items-center justify-between gap-2 border-b py-2 last:border-0"
              >
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">
                    {student.preference ?? "–"}.
                  </span>
                  <span className="truncate font-medium">{student.name}</span>
                  <span className="shrink-0 text-muted-foreground">{student.groupName || "–"}</span>
                  {student.ruleId && (
                    <span
                      className="shrink-0 rounded-sm bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground"
                      title={
                        student.ruleName
                          ? `Regel für diesen Schüler überschrieben: ${student.ruleName}`
                          : "Regel für diesen Schüler überschrieben"
                      }
                    >
                      {student.ruleName ?? "Regel überschrieben"}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`${student.name} wirklich aus dem Modul entfernen?`)) return;
                    removeStudent.mutate({ projectId, moduleId: module!.id, studentId: student.studentId });
                  }}
                  disabled={removeStudent.isPending}
                  aria-label={`${student.name} aus dem Modul entfernen`}
                  className="shrink-0 rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive hover:text-white disabled:pointer-events-none disabled:opacity-50"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
