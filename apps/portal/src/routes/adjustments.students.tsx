import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { StudentModuleDialog } from "../components/StudentModuleDialog";

export const Route = createFileRoute("/adjustments/students")({
  component: AdjustmentsStudentsPage,
});

type Compliance = {
  ruleId: string;
  ruleName: string;
  moduleCountTarget: number;
  moduleCountAssigned: number;
  moduleCountSatisfied: boolean;
  subRulesSatisfied: boolean;
  missingCategoryNames: string[];
};

type Student = {
  id: string;
  name: string;
  groupName: string | null;
};

function AdjustmentsStudentsPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();

  const { data: students, isLoading } = useQuery({
    ...trpc.students.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const { data: compliance } = useQuery({
    ...trpc.students.ruleCompliance.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const complianceByStudent = new Map((compliance ?? []).map((c) => [c.studentId, c]));

  const [selectedStudent, setSelectedStudent] = useState<Student | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  function openStudent(student: Student) {
    setSelectedStudent(student);
    setDialogOpen(true);
  }

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
              <TableHead>Klasse</TableHead>
              <TableHead>Regel</TableHead>
              <TableHead>Module</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => (
              <TableRow key={student.id} onClick={() => openStudent(student)} className="cursor-pointer">
                <TableCell className="font-medium">{student.name}</TableCell>
                <TableCell className="text-muted-foreground">{student.groupName || "–"}</TableCell>
                <RuleCell compliance={complianceByStudent.get(student.id)} />
                <ModuleCountCell compliance={complianceByStudent.get(student.id)} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {projectId && (
        <StudentModuleDialog
          projectId={projectId}
          student={selectedStudent}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}

function RuleCell({ compliance }: { compliance: Compliance | undefined }) {
  if (!compliance) {
    return <TableCell className="text-muted-foreground">–</TableCell>;
  }

  const { ruleName, moduleCountAssigned, moduleCountTarget, moduleCountSatisfied, subRulesSatisfied, missingCategoryNames } =
    compliance;

  if (!subRulesSatisfied) {
    return (
      <TableCell
        className="bg-destructive/10"
        title={`Regel nicht erfüllt – fehlende Kategorie(n): ${missingCategoryNames.join(", ")}`}
      >
        {ruleName}
      </TableCell>
    );
  }

  if (!moduleCountSatisfied) {
    return (
      <TableCell
        className="bg-amber-500/15"
        title={`Zu wenige Module: ${moduleCountAssigned} von ${moduleCountTarget}`}
      >
        {ruleName}
      </TableCell>
    );
  }

  return <TableCell>{ruleName}</TableCell>;
}

function ModuleCountCell({ compliance }: { compliance: Compliance | undefined }) {
  if (!compliance) {
    return <TableCell className="text-muted-foreground">–</TableCell>;
  }

  const { moduleCountAssigned, moduleCountTarget, moduleCountSatisfied, subRulesSatisfied, missingCategoryNames } =
    compliance;
  const missing = moduleCountTarget - moduleCountAssigned;

  if (!subRulesSatisfied) {
    return (
      <TableCell
        className="bg-destructive/10"
        title={`Regel nicht erfüllt – fehlende Kategorie(n): ${missingCategoryNames.join(", ")}`}
      >
        {moduleCountAssigned}/{moduleCountTarget}
      </TableCell>
    );
  }

  if (!moduleCountSatisfied) {
    return (
      <TableCell className="bg-amber-500/15 font-medium">
        {moduleCountAssigned}/{moduleCountTarget}{" "}
        <span className="font-normal text-muted-foreground">
          ({missing} {missing === 1 ? "Modul" : "Module"} fehlen)
        </span>
      </TableCell>
    );
  }

  return (
    <TableCell className="text-muted-foreground">
      {moduleCountAssigned}/{moduleCountTarget}
    </TableCell>
  );
}
