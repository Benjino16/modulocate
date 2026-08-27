import { useEffect } from "react";
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
import { useListFilter, pruneEmpty, type FilterConfig } from "@modulocate/ui/lib/use-list-filter";
import { useTableSort, toggleSort, type SortState, type SortDirection } from "@modulocate/ui/lib/use-table-sort";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";
import { useDialogSearchParam } from "../lib/use-dialog-search-param";
import { StudentModuleDialog } from "../components/StudentModuleDialog";

// Optional keys so an empty search/filter/sort state serializes to no query
// params at all, instead of leaving "?q=&group=&sort=" around by default.
// studentId doubles as StudentModuleDialog's open state — see
// use-dialog-search-param.ts.
type AdjustmentsStudentsSearch = {
  q?: string;
  group?: string[];
  rule?: string[];
  sort?: string;
  dir?: SortDirection;
  studentId?: string;
};

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function parseSortDir(value: unknown): SortDirection | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

export const Route = createFileRoute("/adjustments/students")({
  component: AdjustmentsStudentsPage,
  validateSearch: (search: Record<string, unknown>): AdjustmentsStudentsSearch =>
    pruneEmpty({
      q: typeof search.q === "string" ? search.q : "",
      group: parseStringArray(search.group),
      rule: parseStringArray(search.rule),
      sort: typeof search.sort === "string" ? search.sort : "",
      dir: parseSortDir(search.dir),
      studentId: typeof search.studentId === "string" ? search.studentId : "",
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
  groupId: string | null;
  groupName: string | null;
  ruleId: string | null;
  averagePreference: number | null;
};

function AdjustmentsStudentsPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const navigate = Route.useNavigate();
  const { q = "", group = [], rule = [], sort: sortKey, dir, studentId } = Route.useSearch();
  const sort: SortState = sortKey && dir ? { key: sortKey, dir } : null;

  const { data: students, isLoading } = useQuery({
    ...trpc.students.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const { data: compliance } = useQuery({
    ...trpc.students.ruleCompliance.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const { data: groups } = useQuery({
    ...trpc.studentGroups.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const { data: rules } = useQuery({
    ...trpc.rules.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const complianceByStudent = new Map((compliance ?? []).map((c) => [c.studentId, c]));

  const filters: FilterConfig<Student>[] = [
    {
      key: "group",
      label: "Klasse",
      options: (groups ?? []).map((g) => ({ value: g.id, label: g.name })),
      match: (student, selected) => !!student.groupId && selected.includes(student.groupId),
    },
    {
      key: "rule",
      label: "Regel",
      options: (rules ?? []).map((r) => ({ value: r.id, label: r.name })),
      match: (student, selected) => !!student.ruleId && selected.includes(student.ruleId),
    },
  ];
  const activeFilters = { group, rule };
  const filteredStudents = useListFilter({
    items: students ?? [],
    query: q,
    searchText: (student) =>
      `${student.name} ${student.groupName ?? ""} ${complianceByStudent.get(student.id)?.ruleName ?? ""}`,
    filters,
    activeFilters,
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
        case "averagePreference":
          return student.averagePreference;
        default:
          return null;
      }
    },
  });

  function setQuery(value: string) {
    navigate({ search: (prev) => pruneEmpty({ ...prev, q: value }), replace: true });
  }

  function setFilter(key: string, values: string[]) {
    navigate({
      search: (prev) => pruneEmpty({ ...prev, [key]: values }) as AdjustmentsStudentsSearch,
      replace: true,
    });
  }

  function handleSort(key: string) {
    const next = toggleSort(sort, key);
    navigate({
      search: (prev) => pruneEmpty({ ...prev, sort: next?.key ?? "", dir: next?.dir }),
      replace: true,
    });
  }

  function setStudentId(id: string | undefined, { push }: { push: boolean }) {
    navigate({ search: (prev) => pruneEmpty({ ...prev, studentId: id }), replace: !push });
  }

  const dialog = useDialogSearchParam(studentId, setStudentId);
  const selectedStudent = students?.find((s) => s.id === studentId);

  useEffect(() => {
    if (!students || !studentId) return;
    if (!students.some((s) => s.id === studentId)) setStudentId(undefined, { push: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, studentId]);

  function openStudent(student: Student) {
    dialog.open(student.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Schüler</h2>

      {!isLoading && !!students?.length && (
        <SearchFilterBar
          query={q}
          onQueryChange={setQuery}
          searchPlaceholder="Schüler durchsuchen…"
          filters={filters}
          activeFilters={activeFilters}
          onFilterChange={setFilter}
        />
      )}

      {isLoading && <p className="text-muted-foreground">Lade Schüler…</p>}
      {!isLoading && !students?.length && (
        <p className="text-muted-foreground">Noch keine Schüler angelegt.</p>
      )}
      {!isLoading && !!students?.length && !filteredStudents.length && (
        <p className="text-muted-foreground">Keine Schüler entsprechen der Suche/den Filtern.</p>
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
              <SortableTableHead
                sortKey="averagePreference"
                currentSort={sort}
                onSort={handleSort}
                title="Durchschnitt der Präferenz-Ränge der zugewiesenen Module (1 = Erstwunsch) – reagiert stärker auf einzelne Ausreißer-Module als der Median"
              >
                Ø Prio
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
                <TableCell className="text-muted-foreground">
                  {student.averagePreference !== null ? student.averagePreference.toFixed(1) : "–"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {projectId && (
        <StudentModuleDialog
          projectId={projectId}
          student={selectedStudent}
          open={dialog.isOpen}
          onOpenChange={dialog.onOpenChange}
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
