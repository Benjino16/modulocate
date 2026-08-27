import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@modulocate/ui/components/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@modulocate/ui/components/accordion";
import { useTRPC } from "../trpc";
import { CapacityBar } from "./CapacityBar";

type ModuleSummary = {
  id: string;
  name: string;
  teacher: string | null;
  displayScheduleLabel: string | null;
  min: number;
  max: number;
};

type RosterStudent = {
  studentId: string;
  name: string;
  ruleId: string | null;
  ruleName: string | null;
  groupName: string | null;
  preference: number | null;
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
  const navigate = useNavigate();
  // Radix accordion value, not a boolean: "" when collapsed, "waitlist" when
  // open. Drives the waitlist query's `enabled` too, so it's only fetched
  // once someone actually expands the section.
  const [waitlistOpen, setWaitlistOpen] = useState("");

  const { data: roster, isLoading } = useQuery({
    ...trpc.modules.roster.queryOptions({ projectId, moduleId: module?.id ?? "" }),
    enabled: open && !!module,
  });

  const { data: waitlist, isLoading: waitlistLoading } = useQuery({
    ...trpc.modules.waitlist.queryOptions({ projectId, moduleId: module?.id ?? "" }),
    enabled: open && !!module && waitlistOpen === "waitlist",
  });

  const removeStudent = useMutation(
    trpc.modules.removeStudent.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.modules.roster.queryKey({ projectId, moduleId: module!.id }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.modules.waitlist.queryKey({ projectId, moduleId: module!.id }),
        });
        queryClient.invalidateQueries({ queryKey: trpc.modules.list.queryKey({ projectId }) });
      },
    }),
  );

  function openStudent(student: RosterStudent) {
    navigate({ to: "/adjustments/students", search: { studentId: student.studentId } });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setWaitlistOpen("");
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle title={module?.name}>{module?.name}</DialogTitle>
        </DialogHeader>

        <p className="-mt-2 text-sm text-muted-foreground">
          {module?.displayScheduleLabel || "Kein Termin festgelegt"} · {module?.teacher || "Kein Lehrer zugeteilt"}
        </p>

        {module && !isLoading && (
          <CapacityBar studentCount={roster?.length ?? 0} min={module.min} max={module.max} />
        )}

        {isLoading && <p className="text-muted-foreground">Lade Schüler…</p>}
        {!isLoading && !roster?.length && (
          <p className="text-muted-foreground">Noch keine Schüler zugewiesen.</p>
        )}

        {!!roster?.length && (
          <StudentList
            students={roster}
            onSelect={openStudent}
            onRemove={
              module
                ? (student) => {
                    if (!window.confirm(`${student.name} wirklich aus dem Modul entfernen?`)) return;
                    removeStudent.mutate({ projectId, moduleId: module.id, studentId: student.studentId });
                  }
                : undefined
            }
            removePending={removeStudent.isPending}
          />
        )}

        <Accordion type="single" collapsible value={waitlistOpen} onValueChange={setWaitlistOpen}>
          <AccordionItem value="waitlist">
            <AccordionTrigger>
              Warteliste{waitlist ? ` (${waitlist.length})` : ""}
            </AccordionTrigger>
            <AccordionContent>
              {waitlistLoading && <p className="text-muted-foreground">Lade Warteliste…</p>}
              {!waitlistLoading && !waitlist?.length && (
                <p className="text-muted-foreground">
                  Kein Schüler hat dieses Modul gerankt, ohne einen Platz zu bekommen.
                </p>
              )}
              {!!waitlist?.length && <StudentList students={waitlist} onSelect={openStudent} />}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}

function StudentList({
  students,
  onSelect,
  onRemove,
  removePending,
}: {
  students: RosterStudent[];
  onSelect: (student: RosterStudent) => void;
  onRemove?: (student: RosterStudent) => void;
  removePending?: boolean;
}) {
  return (
    <ul className="flex flex-col">
      {students.map((student) => (
        <li
          key={student.studentId}
          className="flex items-center justify-between gap-2 border-b py-2 last:border-0"
        >
          <button
            type="button"
            onClick={() => onSelect(student)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 text-left text-sm transition-colors hover:bg-accent"
          >
            <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">
              {student.preference ?? "–"}.
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{student.name}</span>
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
          </button>

          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(student)}
              disabled={removePending}
              aria-label={`${student.name} aus dem Modul entfernen`}
              className="shrink-0 rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive hover:text-white disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
