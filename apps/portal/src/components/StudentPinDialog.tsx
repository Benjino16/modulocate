import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, PinOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@modulocate/ui/components/dialog";
import { SearchFilterBar } from "@modulocate/ui/components/search-filter-bar";
import { useListFilter } from "@modulocate/ui/lib/use-list-filter";
import { cn } from "@modulocate/ui/lib/utils";
import { useTRPC } from "../trpc";

type StudentSummary = {
  id: string;
  name: string;
  groupName: string | null;
};

// Modal for pinning/unpinning modules for one student in the Zuteilung >
// Schüler tab, guaranteeing them before the next allocation run — see
// packages/allocation-engine/src/allocate.ts's pin-seeding step. Modeled on
// StudentModuleDialog.tsx (the post-run manual-assignment dialog), but lists
// every module in the project (not just eligible ones — pinning is meant to
// bypass blocked category/date rules) and has no capacity/compliance
// concerns, since pins ignore capacity by definition.
export function StudentPinDialog({
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
  const [query, setQuery] = useState("");

  const { data: options, isLoading } = useQuery({
    ...trpc.students.pinnableModules.queryOptions({ projectId, studentId: student?.id ?? "" }),
    enabled: open && !!student,
  });

  const filteredOptions = useListFilter({
    items: options ?? [],
    query,
    searchText: (module) => `${module.name} ${module.categoryNames.join(" ")}`,
    activeFilters: {},
  });

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: trpc.students.pinnableModules.queryKey({ projectId, studentId: student!.id }),
    });
    queryClient.invalidateQueries({ queryKey: trpc.students.list.queryKey({ projectId }) });
    queryClient.invalidateQueries({ queryKey: trpc.modules.list.queryKey({ projectId }) });
  }

  const pinStudent = useMutation(trpc.modules.pinStudent.mutationOptions({ onSuccess: invalidate }));
  const unpinStudent = useMutation(trpc.modules.unpinStudent.mutationOptions({ onSuccess: invalidate }));
  const isPending = pinStudent.isPending || unpinStudent.isPending;

  function handlePin(moduleId: string) {
    if (!student) return;
    pinStudent.mutate({ projectId, moduleId, studentId: student.id });
  }

  function handleUnpin(moduleId: string) {
    if (!student) return;
    unpinStudent.mutate({ projectId, moduleId, studentId: student.id });
  }

  function openModule(moduleId: string) {
    navigate({ to: "/adjustments/modules", search: { moduleId } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle title={student?.name}>{student?.name}</DialogTitle>
        </DialogHeader>

        <p className="-mt-2 text-sm text-muted-foreground">{student?.groupName || "Keine Klasse"}</p>

        {!isLoading && !!options?.length && (
          <SearchFilterBar
            query={query}
            onQueryChange={setQuery}
            searchPlaceholder="Module durchsuchen…"
            activeFilters={{}}
            onFilterChange={() => {}}
          />
        )}

        {isLoading && <p className="text-muted-foreground">Lade Module…</p>}
        {!isLoading && !options?.length && <p className="text-muted-foreground">Keine Module vorhanden.</p>}
        {!isLoading && !!options?.length && !filteredOptions.length && (
          <p className="text-muted-foreground">Keine Module entsprechen der Suche.</p>
        )}

        {!!filteredOptions.length && (
          <ul className="flex flex-col gap-1">
            {filteredOptions.map((module) => (
              <li
                key={module.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-1.5",
                  module.pinned && "bg-success/15 dark:bg-success/25",
                )}
              >
                <button
                  type="button"
                  onClick={() => openModule(module.id)}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md py-0.5 text-left transition-colors hover:bg-accent"
                >
                  <span className="min-w-0 truncate text-sm font-medium">{module.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {module.displayScheduleLabel || "Kein Termin festgelegt"}
                    {module.categoryNames.length > 0 && ` · ${module.categoryNames.join(", ")}`}
                  </span>
                </button>

                {module.pinned ? (
                  <button
                    type="button"
                    onClick={() => handleUnpin(module.id)}
                    disabled={isPending}
                    aria-label={`${module.name} loslösen`}
                    className="shrink-0 rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive hover:text-white disabled:pointer-events-none disabled:opacity-50"
                  >
                    <PinOff className="size-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handlePin(module.id)}
                    disabled={isPending}
                    aria-label={`${module.name} anheften`}
                    className="shrink-0 rounded-md p-1.5 text-success transition-colors hover:bg-success hover:text-white disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Pin className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
