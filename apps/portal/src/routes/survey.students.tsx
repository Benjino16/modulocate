import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Link2 } from "lucide-react";
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

export const Route = createFileRoute("/survey/students")({
  component: SurveyStudentsPage,
});

// Vote app isn't deployed yet, mirrors the worker's own VOTE_APP_URL default
// (apps/worker/src/processors/votingInvite.ts) until it has a real URL.
const VOTE_APP_URL = "http://localhost:5174";

type Student = {
  id: string;
  name: string;
  email: string;
  groupName: string | null;
  signInCode: string | null;
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
  if (student.voteSubmittedAt) return `Abgestimmt am ${formatDateTime(student.voteSubmittedAt)}`;
  if (student.voteOpenedAt) return `Geöffnet am ${formatDateTime(student.voteOpenedAt)}`;
  return "Nicht geöffnet";
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

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Schüler</h2>

      {isLoading && <p className="text-muted-foreground">Lade Schüler…</p>}
      {!isLoading && !students?.length && (
        <p className="text-muted-foreground">Noch keine Schüler angelegt.</p>
      )}

      {!!students?.length && (
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
            {students.map((student) => (
              <TableRow key={student.id}>
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
    </div>
  );
}
