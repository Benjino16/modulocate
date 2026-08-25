import { useState } from "react";
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
  SortableTableHead,
} from "@modulocate/ui/components/table";
import { SearchFilterBar } from "@modulocate/ui/components/search-filter-bar";
import { useListFilter, pruneEmpty } from "@modulocate/ui/lib/use-list-filter";
import { useTableSort, toggleSort, type SortState, type SortDirection } from "@modulocate/ui/lib/use-table-sort";
import { cn } from "@modulocate/ui/lib/utils";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";
import { resolveResultStatus, RESULT_STATUS_ROW_COLOR, RESULT_STATUS_SORT_ORDER } from "../lib/resultStatus";
import { ResendResultsDialog } from "../components/ResendResultsDialog";

// Optional keys so an empty search/sort state serializes to no query params
// at all, instead of leaving "?q=&sort=" around by default.
type ResultsStudentsSearch = { q?: string; sort?: string; dir?: SortDirection };

function parseSortDir(value: unknown): SortDirection | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

export const Route = createFileRoute("/results/students")({
  component: ResultsStudentsPage,
  validateSearch: (search: Record<string, unknown>): ResultsStudentsSearch =>
    pruneEmpty({
      q: typeof search.q === "string" ? search.q : "",
      sort: typeof search.sort === "string" ? search.sort : "",
      dir: parseSortDir(search.dir),
    }),
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
  const navigate = Route.useNavigate();
  const { q = "", sort: sortKey, dir } = Route.useSearch();
  // Default: worst-to-best status (same order as before), now just the
  // initial sort — any column stays clickable to override it.
  const sort: SortState = sortKey && dir ? { key: sortKey, dir } : { key: "status", dir: "asc" };

  const { data: students, isLoading } = useQuery({
    ...trpc.students.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const filteredStudents = useListFilter({
    items: students ?? [],
    query: q,
    searchText: (student) =>
      `${student.name} ${student.email} ${student.email2 ?? ""} ${student.groupName ?? ""}`,
    activeFilters: {},
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
        case "group":
          return student.groupName ?? "";
        case "status":
          return RESULT_STATUS_SORT_ORDER.indexOf(resolveResultStatus(student));
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

  const [resendStudent, setResendStudent] = useState<Student | undefined>();
  const [resendDialogOpen, setResendDialogOpen] = useState(false);

  function openResend(student: Student) {
    setResendStudent(student);
    setResendDialogOpen(true);
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
              <SortableTableHead sortKey="email" currentSort={sort} onSort={handleSort}>
                E-Mail
              </SortableTableHead>
              <SortableTableHead sortKey="group" currentSort={sort} onSort={handleSort}>
                Klasse
              </SortableTableHead>
              <SortableTableHead sortKey="status" currentSort={sort} onSort={handleSort}>
                Ergebnis-Status
              </SortableTableHead>
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
