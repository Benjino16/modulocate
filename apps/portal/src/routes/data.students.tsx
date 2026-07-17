import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@modulocate/ui/components/table";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";
import { StudentDialog } from "../components/StudentDialog";

export const Route = createFileRoute("/data/students")({
  component: StudentsPage,
});

type Student = {
  id: string;
  name: string;
  email: string;
  email2: string | null;
  groupId: string | null;
  groupName: string | null;
  ruleId: string | null;
  voteStatus: string;
};

function StudentsPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const { data: students, isLoading } = useQuery({
    ...trpc.students.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const [editingStudent, setEditingStudent] = useState<Student | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  function openCreate() {
    setEditingStudent(undefined);
    setDialogOpen(true);
  }

  function openEdit(student: Student) {
    setEditingStudent(student);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Schüler</h2>
        <Button size="sm" onClick={openCreate} disabled={!projectId}>
          <Plus /> Neuer Schüler
        </Button>
      </div>

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
              <TableHead>E-Mail (2)</TableHead>
              <TableHead>Klasse</TableHead>
              <TableHead>Vote-Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => (
              <TableRow
                key={student.id}
                onClick={() => openEdit(student)}
                className="cursor-pointer"
              >
                <TableCell className="font-medium">{student.name}</TableCell>
                <TableCell className="text-muted-foreground">{student.email}</TableCell>
                <TableCell className="text-muted-foreground">{student.email2 || "–"}</TableCell>
                <TableCell className="text-muted-foreground">{student.groupName || "–"}</TableCell>
                <TableCell className="text-muted-foreground">{student.voteStatus}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {projectId && (
        <StudentDialog
          projectId={projectId}
          student={editingStudent}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}
