import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, TriangleAlert, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@modulocate/ui/components/dialog";
import { cn } from "@modulocate/ui/lib/utils";
import { useTRPC } from "../trpc";
import { CapacityBar } from "./CapacityBar";

type StudentSummary = {
  id: string;
  name: string;
  groupName: string | null;
};

export function StudentModuleDialog({
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
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: options, isLoading } = useQuery({
    ...trpc.students.moduleOptions.queryOptions({ projectId, studentId: student?.id ?? "" }),
    enabled: open && !!student,
  });

  // Same query (and cache entry) the Schüler-tab table uses — sharing it
  // means this refetches from the very invalidation below and the compliance
  // banner updates live the moment a module is added/removed, instead of
  // relying on a parent-owned query passed down as a prop.
  const { data: complianceList } = useQuery({
    ...trpc.students.ruleCompliance.queryOptions({ projectId }),
    enabled: open && !!student,
  });
  const compliance = complianceList?.find((c) => c.studentId === student?.id);

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: trpc.students.moduleOptions.queryKey({ projectId, studentId: student!.id }),
    });
    queryClient.invalidateQueries({ queryKey: trpc.students.ruleCompliance.queryKey({ projectId }) });
    queryClient.invalidateQueries({ queryKey: trpc.modules.list.queryKey({ projectId }) });
  }

  const addStudent = useMutation(trpc.modules.addStudent.mutationOptions({ onSuccess: invalidate }));
  const removeStudent = useMutation(trpc.modules.removeStudent.mutationOptions({ onSuccess: invalidate }));
  const isPending = addStudent.isPending || removeStudent.isPending;

  function handleAssign(moduleId: string, moduleName: string) {
    if (!student) return;
    if (!window.confirm(`${student.name} dem Modul "${moduleName}" zuweisen?`)) return;
    addStudent.mutate({ projectId, moduleId, studentId: student.id });
  }

  function handleRemove(moduleId: string, moduleName: string) {
    if (!student) return;
    if (!window.confirm(`${student.name} wirklich aus "${moduleName}" entfernen?`)) return;
    removeStudent.mutate({ projectId, moduleId, studentId: student.id });
  }

  function openModule(moduleId: string) {
    navigate({ to: "/adjustments/modules", search: { moduleId } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{student?.name}</DialogTitle>
        </DialogHeader>

        <p className="-mt-2 text-sm text-muted-foreground">
          {student?.groupName || "Keine Klasse"} · {compliance?.ruleName || "Keine Regel zugewiesen"}
        </p>

        {compliance && !compliance.subRulesSatisfied && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <TriangleAlert className="size-4 shrink-0" />
            Regel nicht erfüllt — fehlende Kategorie(n): {compliance.missingCategoryNames.join(", ")}
          </p>
        )}
        {compliance && !compliance.moduleCountSatisfied && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
            <TriangleAlert className="size-4 shrink-0" />
            Zu wenige Module: {compliance.moduleCountAssigned} von {compliance.moduleCountTarget}
          </p>
        )}

        {isLoading && <p className="text-muted-foreground">Lade Module…</p>}
        {!isLoading && !options?.length && (
          <p className="text-muted-foreground">Keine Module für diesen Schüler sichtbar.</p>
        )}

        {!!options?.length && (
          <ul className="flex flex-col gap-1">
            {options.map((module) => {
              const label = (
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">
                      {module.preference ?? "–"}.
                    </span>
                    <span className="truncate font-medium">{module.name}</span>
                  </div>
                  <div className="truncate pl-7 text-xs text-muted-foreground">
                    {module.displayScheduleLabel || "Kein Termin festgelegt"}
                    {module.categoryNames.length > 0 && ` · ${module.categoryNames.join(", ")}`}
                  </div>
                </div>
              );
              const bar = (
                <div className="pl-7">
                  <CapacityBar studentCount={module.studentCount} min={module.min} max={module.max} />
                </div>
              );

              return (
                <li
                  key={module.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md px-2 py-1.5",
                    module.assigned && "bg-success/15 dark:bg-success/25",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openModule(module.id)}
                    className="flex min-w-0 flex-1 flex-col gap-1 rounded-md py-0.5 text-left transition-colors hover:bg-accent"
                  >
                    {label}
                    {bar}
                  </button>

                  {module.assigned ? (
                    <button
                      type="button"
                      onClick={() => handleRemove(module.id, module.name)}
                      disabled={isPending}
                      aria-label={`${module.name} entfernen`}
                      className="shrink-0 rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive hover:text-white disabled:pointer-events-none disabled:opacity-50"
                    >
                      <X className="size-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAssign(module.id, module.name)}
                      disabled={isPending}
                      aria-label={`${module.name} zuweisen`}
                      className="shrink-0 rounded-md p-1.5 text-success transition-colors hover:bg-success hover:text-white disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Plus className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
