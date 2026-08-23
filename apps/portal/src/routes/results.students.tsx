import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@modulocate/ui/components/table";
import { cn } from "@modulocate/ui/lib/utils";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";
import { resolveResultStatus, RESULT_STATUS_ROW_COLOR, RESULT_STATUS_SORT_ORDER } from "../lib/resultStatus";
import { ResendResultsDialog } from "../components/ResendResultsDialog";

export const Route = createFileRoute("/results/students")({
  component: ResultsStudentsPage,
});

type Student = {
  id: string;
  name: string;
  email: string;
  email2: string | null;
  groupName: string | null;
  ruleName: string | null;
  resultsSentAt: string | null;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resultStatusLabel(student: Student) {
  switch (resolveResultStatus(student)) {
    case "sent":
      return `Erhalten am ${formatDateTime(student.resultsSentAt!)}`;
    case "none":
      return "Nicht erhalten";
  }
}

function ResultsStudentsPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const { data: students, isLoading } = useQuery({
    ...trpc.students.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const sortedStudents = useMemo(() => {
    if (!students) return students;
    return [...students].sort(
      (a, b) =>
        RESULT_STATUS_SORT_ORDER.indexOf(resolveResultStatus(a)) -
        RESULT_STATUS_SORT_ORDER.indexOf(resolveResultStatus(b)),
    );
  }, [students]);

  const [resendStudent, setResendStudent] = useState<Student | undefined>();
  const [resendDialogOpen, setResendDialogOpen] = useState(false);

  function openResend(student: Student) {
    setResendStudent(student);
    setResendDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Schüler</h2>

      {isLoading && <p className="text-muted-foreground">Lade Schüler…</p>}
      {!isLoading && !students?.length && (
        <p className="text-muted-foreground">Noch keine Schüler angelegt.</p>
      )}

      {!!sortedStudents?.length && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>E-Mail</TableHead>
              <TableHead>Klasse</TableHead>
              <TableHead>Ergebnis-Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStudents.map((student) => (
              <TableRow
                key={student.id}
                className={RESULT_STATUS_ROW_COLOR[resolveResultStatus(student)]}
              >
                <TableCell className="font-medium">{student.name}</TableCell>
                <TableCell className="text-muted-foreground">{student.email}</TableCell>
                <TableCell className="text-muted-foreground">{student.groupName || "–"}</TableCell>
                <TableCell
                  className={cn(
                    "text-muted-foreground",
                    student.resultsSentAt && "text-foreground",
                  )}
                >
                  {resultStatusLabel(student)}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => openResend(student)}
                    title="Ergebnisse erneut zusenden"
                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Mail className="size-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {projectId && (
        <ResendResultsDialog
          projectId={projectId}
          student={resendStudent}
          open={resendDialogOpen}
          onOpenChange={setResendDialogOpen}
        />
      )}
    </div>
  );
}
