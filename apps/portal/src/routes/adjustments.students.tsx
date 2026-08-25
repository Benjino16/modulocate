import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  SortableTableHead,
} from "@modulocate/ui/components/table";
import { SearchFilterBar } from "@modulocate/ui/components/search-filter-bar";
import { useListFilter, pruneEmpty } from "@modulocate/ui/lib/use-list-filter";
import { useTableSort, toggleSort, type SortState, type SortDirection } from "@modulocate/ui/lib/use-table-sort";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";
import { StudentModuleDialog } from "../components/StudentModuleDialog";

// Optional keys so an empty search/sort state serializes to no query params
// at all, instead of leaving "?q=&sort=" around by default.
type AdjustmentsStudentsSearch = { q?: string; sort?: string; dir?: SortDirection };

function parseSortDir(value: unknown): SortDirection | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

export const Route = createFileRoute("/adjustments/students")({
  component: AdjustmentsStudentsPage,
  validateSearch: (search: Record<string, unknown>): AdjustmentsStudentsSearch =>
    pruneEmpty({
      q: typeof search.q === "string" ? search.q : "",
      sort: typeof search.sort === "string" ? search.sort : "",
      dir: parseSortDir(search.dir),
    }),
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
  const navigate = Route.useNavigate();
  const { q = "", sort: sortKey, dir } = Route.useSearch();
  const sort: SortState = sortKey && dir ? { key: sortKey, dir } : null;

  const { data: students, isLoading } = useQuery({
    ...trpc.students.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const { data: compliance } = useQuery({
    ...trpc.students.ruleCompliance.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const complianceByStudent = new Map((compliance ?? []).map((c) => [c.studentId, c]));

  const filteredStudents = useListFilter({
    items: students ?? [],
    query: q,
    searchText: (student) =>
      `${student.name} ${student.groupName ?? ""} ${complianceByStudent.get(student.id)?.ruleName ?? ""}`,
    activeFilters: {},
  });
  const sortedStudents = useTableSort({
    items: filteredStudents,
    sort,
    sortValue: (student, key) => {
      const studentCompliance = complianceByStudent.get(student.id);
      switch (key) {
        case "name":
          return student.name;
        case "group":
          return student.groupName ?? "";
        case "rule":
          return studentCompliance?.ruleName ?? "";
        case "modules":
          return studentCompliance?.moduleCountAssigned ?? null;
        default:
          return null;
      }
    },
  });

  function setQuery(value: string) {
    navigate({
      search: (prev) => pruneEmpty({ q: value, sort: prev.sort ?? "", dir: prev.dir }),
      replace: true,
    });
  }

  function handleSort(key: string) {
    const next = toggleSort(sort, key);
    navigate({
      search: (prev) => pruneEmpty({ q: prev.q ?? "", sort: next?.key ?? "", dir: next?.dir }),
      replace: true,
    });
  }

  const [selectedStudent, setSelectedStudent] = useState<Student | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  function openStudent(student: Student) {
    setSelectedStudent(student);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Schüler</h2>

      {!isLoading && !!students?.length && (
        <SearchFilterBar
          query={q}
          onQueryChange={setQuery}
          searchPlaceholder="Schüler durchsuchen…"
          activeFilters={{}}
          onFilterChange={() => {}}
        />
      )}

      {isLoading && <p className="text-muted-foreground">Lade Schüler…</p>}
      {!isLoading && !students?.length && (
        <p className="text-muted-foreground">Noch keine Schüler angelegt.</p>
      )}
      {!isLoading && !!students?.length && !filteredStudents.length && (
        <p className="text-muted-foreground">Keine Schüler entsprechen der Suche.</p>
      )}

      {!!sortedStudents.length && (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="name" currentSort={sort} onSort={handleSort}>
                Name
              </SortableTableHead>
              <SortableTableHead sortKey="group" currentSort={sort} onSort={handleSort}>
                Klasse
              </SortableTableHead>
              <SortableTableHead sortKey="rule" currentSort={sort} onSort={handleSort}>
                Regel
              </SortableTableHead>
              <SortableTableHead sortKey="modules" currentSort={sort} onSort={handleSort}>
                Module
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStudents.map((student) => (
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
        className="bg-warning/15 dark:bg-warning/25"
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
      <TableCell className="bg-warning/15 font-medium dark:bg-warning/25">
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
