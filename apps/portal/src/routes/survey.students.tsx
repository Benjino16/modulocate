import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Link2, Mail } from "lucide-react";
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
import { resolveVoteStatus, VOTE_STATUS_ROW_COLOR, VOTE_STATUS_SORT_ORDER } from "../lib/voteStatus";
import { StudentPreferencesDialog } from "../components/StudentPreferencesDialog";
import { ResendVoteCodeDialog } from "../components/ResendVoteCodeDialog";

export const Route = createFileRoute("/survey/students")({
  component: SurveyStudentsPage,
});

// Portal and vote are same-origin behind Traefik (path-routed to /portal and
// /voting — see infra/compose.yaml), so this can just use the page's own
// origin instead of hardcoding a host.
const VOTE_APP_URL = `${window.location.origin}/voting`;

type Student = {
  id: string;
  name: string;
  email: string;
  email2: string | null;
  groupName: string | null;
  ruleName: string | null;
  signInCode: string | null;
  voteCodeSentAt: string | null;
  voteOpenedAt: string | null;
  voteSubmittedAt: string | null;
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

function voteStatusLabel(student: Student) {
  switch (resolveVoteStatus(student)) {
    case "submitted":
      return `Abgestimmt am ${formatDateTime(student.voteSubmittedAt!)}`;
    case "opened":
      return `Geöffnet am ${formatDateTime(student.voteOpenedAt!)}`;
    case "sent":
      return `Mail erhalten am ${formatDateTime(student.voteCodeSentAt!)}`;
    case "none":
      return "Nicht erhalten";
  }
}

function CopyButton({ value, label, icon: Icon }: { value: string; label: string; icon: typeof Copy }) {
  const [copied, setCopied] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground group-hover:opacity-100"
    >
      {copied ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
    </button>
  );
}

function SurveyStudentsPage() {
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
        VOTE_STATUS_SORT_ORDER.indexOf(resolveVoteStatus(a)) -
        VOTE_STATUS_SORT_ORDER.indexOf(resolveVoteStatus(b)),
    );
  }, [students]);

  const [selectedStudent, setSelectedStudent] = useState<Student | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  const [resendStudent, setResendStudent] = useState<Student | undefined>();
  const [resendDialogOpen, setResendDialogOpen] = useState(false);

  function openStudent(student: Student) {
    setSelectedStudent(student);
    setDialogOpen(true);
  }

  function openResend(e: React.MouseEvent, student: Student) {
    e.stopPropagation();
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
              <TableHead>Voting-Code</TableHead>
              <TableHead>Voting-Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStudents.map((student) => (
              <TableRow
                key={student.id}
                onClick={() => openStudent(student)}
                className={cn("cursor-pointer", VOTE_STATUS_ROW_COLOR[resolveVoteStatus(student)])}
              >
                <TableCell className="font-medium">{student.name}</TableCell>
                <TableCell className="text-muted-foreground">{student.email}</TableCell>
                <TableCell className="text-muted-foreground">{student.groupName || "–"}</TableCell>
                <TableCell>
                  {student.signInCode ? (
                    <div className="group flex items-center gap-1.5">
                      <span className="font-mono text-xs text-muted-foreground">
                        {student.signInCode}
                      </span>
                      <CopyButton value={student.signInCode} label="Code kopieren" icon={Copy} />
                      <CopyButton
                        value={`${VOTE_APP_URL}/login?code=${student.signInCode}`}
                        label="Voting-Link kopieren"
                        icon={Link2}
                      />
                      <button
                        type="button"
                        onClick={(e) => openResend(e, student)}
                        title="Voting-Code erneut zusenden"
                        className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground group-hover:opacity-100"
                      >
                        <Mail className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-muted-foreground",
                    student.voteSubmittedAt && "text-foreground",
                  )}
                >
                  {voteStatusLabel(student)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {projectId && (
        <StudentPreferencesDialog
          projectId={projectId}
          student={selectedStudent}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}

      {projectId && (
        <ResendVoteCodeDialog
          projectId={projectId}
          student={resendStudent}
          open={resendDialogOpen}
          onOpenChange={setResendDialogOpen}
        />
      )}
    </div>
  );
}
