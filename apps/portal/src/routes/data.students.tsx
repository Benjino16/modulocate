import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
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
import { useProject } from "../lib/project-context";
import { StudentDialog } from "../components/StudentDialog";

// Optional keys so an empty search/filter/sort state serializes to no query
// params at all, instead of leaving "?q=&group=&sort=" around by default.
type StudentsSearch = {
  q?: string;
  group?: string[];
  rule?: string[];
  sort?: string;
  dir?: SortDirection;
};

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function parseSortDir(value: unknown): SortDirection | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

export const Route = createFileRoute("/data/students")({
  component: StudentsPage,
  validateSearch: (search: Record<string, unknown>): StudentsSearch =>
    pruneEmpty({
      q: typeof search.q === "string" ? search.q : "",
      group: parseStringArray(search.group),
      rule: parseStringArray(search.rule),
      sort: typeof search.sort === "string" ? search.sort : "",
      dir: parseSortDir(search.dir),
    }),
});

type Student = {
  id: string;
  name: string;
  email: string;
  email2: string | null;
  groupId: string | null;
  groupName: string | null;
  ruleId: string | null;
  ruleName: string | null;
};

function StudentsPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const navigate = Route.useNavigate();
  const { q = "", group = [], rule = [], sort: sortKey, dir } = Route.useSearch();
  const sort: SortState = sortKey && dir ? { key: sortKey, dir } : null;
  const { data: students, isLoading } = useQuery({
    ...trpc.students.list.queryOptions({ projectId: projectId! }),
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
    searchText: (student) => `${student.name} ${student.email} ${student.email2 ?? ""}`,
    filters,
    activeFilters,
  });
  const sortedStudents = useTableSort({
    items: filteredStudents,
    sort,
    sortValue: (student, key) => {
      switch (key) {
        case "name":
          return student.name;
        case "email":
          return student.email;
        case "email2":
          return student.email2 ?? "";
        case "group":
          return student.groupName ?? "";
        default:
          return null;
      }
    },
  });

  function setQuery(value: string) {
    navigate({
      search: (prev) =>
        pruneEmpty({ q: value, group: prev.group ?? [], rule: prev.rule ?? [], sort: prev.sort ?? "", dir: prev.dir }),
      replace: true,
    });
  }

  function setFilter(key: string, values: string[]) {
    navigate({
      search: (prev) =>
        pruneEmpty({
          q: prev.q ?? "",
          group: prev.group ?? [],
          rule: prev.rule ?? [],
          sort: prev.sort ?? "",
          dir: prev.dir,
          [key]: values,
        }) as StudentsSearch,
      replace: true,
    });
  }

  function handleSort(key: string) {
    const next = toggleSort(sort, key);
    navigate({
      search: (prev) =>
        pruneEmpty({
          q: prev.q ?? "",
          group: prev.group ?? [],
          rule: prev.rule ?? [],
          sort: next?.key ?? "",
          dir: next?.dir,
        }),
      replace: true,
    });
  }

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
              <SortableTableHead sortKey="email" currentSort={sort} onSort={handleSort}>
                E-Mail
              </SortableTableHead>
              <SortableTableHead sortKey="email2" currentSort={sort} onSort={handleSort}>
                E-Mail (2)
              </SortableTableHead>
              <SortableTableHead sortKey="group" currentSort={sort} onSort={handleSort}>
                Klasse
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStudents.map((student) => (
              <TableRow
                key={student.id}
                onClick={() => openEdit(student)}
                className="cursor-pointer"
              >
                <TableCell className="font-medium">{student.name}</TableCell>
                <TableCell className="text-muted-foreground">{student.email}</TableCell>
                <TableCell className="text-muted-foreground">{student.email2 || "–"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {student.groupName || "–"}
                  {student.ruleId && (
                    <span
                      className="ml-2 rounded-sm bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground"
                      title={
                        student.ruleName
                          ? `Regel für diesen Schüler überschrieben: ${student.ruleName}`
                          : "Regel für diesen Schüler überschrieben"
                      }
                    >
                      Regel überschrieben
                    </span>
                  )}
                </TableCell>
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
