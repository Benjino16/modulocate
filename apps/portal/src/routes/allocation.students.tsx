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
import { useListFilter, pruneEmpty } from "@modulocate/ui/lib/use-list-filter";
import { useTableSort, toggleSort, type SortState, type SortDirection } from "@modulocate/ui/lib/use-table-sort";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";
import { useDialogSearchParam } from "../lib/use-dialog-search-param";
import { StudentPinDialog } from "../components/StudentPinDialog";

// Optional keys so an empty search/sort state serializes to no query params
// at all. studentId doubles as StudentPinDialog's open state — see
// use-dialog-search-param.ts.
type AllocationStudentsSearch = { q?: string; sort?: string; dir?: SortDirection; studentId?: string };

function parseSortDir(value: unknown): SortDirection | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

export const Route = createFileRoute("/allocation/students")({
  component: AllocationStudentsPage,
  validateSearch: (search: Record<string, unknown>): AllocationStudentsSearch =>
    pruneEmpty({
      q: typeof search.q === "string" ? search.q : "",
      sort: typeof search.sort === "string" ? search.sort : "",
      dir: parseSortDir(search.dir),
      studentId: typeof search.studentId === "string" ? search.studentId : "",
    }),
});

type PinnedModule = { id: string; name: string };

type Student = {
  id: string;
  name: string;
  groupName: string | null;
  pinnedModules: PinnedModule[];
};

function AllocationStudentsPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const navigate = Route.useNavigate();
  const { q = "", sort: sortKey, dir, studentId } = Route.useSearch();
  const sort: SortState = sortKey && dir ? { key: sortKey, dir } : null;

  const { data: students, isLoading } = useQuery({
    ...trpc.students.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const filteredStudents = useListFilter({
    items: students ?? [],
    query: q,
    searchText: (student) =>
      `${student.name} ${student.groupName ?? ""} ${student.pinnedModules.map((m) => m.name).join(" ")}`,
    activeFilters: {},
  });
  const sortedStudents = useTableSort({
    items: filteredStudents,
    sort,
    sortValue: (student, key) => {
      switch (key) {
        case "name":
          return student.name;
        case "group":
          return student.groupName ?? "";
        case "pinnedModules":
          return student.pinnedModules.length;
        default:
          return null;
      }
    },
  });

  function setQuery(value: string) {
    navigate({ search: (prev) => pruneEmpty({ ...prev, q: value }), replace: true });
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
      <p className="-mt-2 text-muted-foreground">
        Module, die hier angeheftet werden, erhält der Schüler garantiert vor dem eigentlichen
        Zuteilungs-Durchlauf — unabhängig von Teilnehmerlimit, blockierten Kategorien/Terminen und
        Terminüberschneidungen untereinander.
      </p>

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
              <SortableTableHead sortKey="pinnedModules" currentSort={sort} onSort={handleSort}>
                Angeheftete Module
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStudents.map((student) => (
              <TableRow key={student.id} onClick={() => openStudent(student)} className="cursor-pointer">
                <TableCell className="font-medium">{student.name}</TableCell>
                <TableCell className="text-muted-foreground">{student.groupName || "–"}</TableCell>
                <TableCell>
                  {student.pinnedModules.length > 0 ? (
                    student.pinnedModules.map((m) => m.name).join(", ")
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {projectId && (
        <StudentPinDialog
          projectId={projectId}
          student={selectedStudent}
          open={dialog.isOpen}
          onOpenChange={dialog.onOpenChange}
        />
      )}
    </div>
  );
}
