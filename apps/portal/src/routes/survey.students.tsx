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
  SortableTableHead,
} from "@modulocate/ui/components/table";
import { SearchFilterBar } from "@modulocate/ui/components/search-filter-bar";
import { useListFilter, pruneEmpty, type FilterConfig } from "@modulocate/ui/lib/use-list-filter";
import { useTableSort, toggleSort, type SortState, type SortDirection } from "@modulocate/ui/lib/use-table-sort";
import { cn } from "@modulocate/ui/lib/utils";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";
import {
  resolveVoteStatus,
  VOTE_STATUS_LABEL,
  VOTE_STATUS_ORDER,
  VOTE_STATUS_ROW_COLOR,
  VOTE_STATUS_SORT_ORDER,
} from "../lib/voteStatus";
import { StudentPreferencesDialog } from "../components/StudentPreferencesDialog";
import { ResendVoteCodeDialog } from "../components/ResendVoteCodeDialog";
import { RegenerateCodeDialog } from "../components/RegenerateCodeDialog";

// Optional keys so an empty search/filter/sort state serializes to no query
// params at all, instead of leaving "?q=&status=&sort=" around by default.
type SurveyStudentsSearch = { q?: string; status?: string[]; sort?: string; dir?: SortDirection };

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function parseSortDir(value: unknown): SortDirection | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

export const Route = createFileRoute("/survey/students")({
  component: SurveyStudentsPage,
  validateSearch: (search: Record<string, unknown>): SurveyStudentsSearch =>
    pruneEmpty({
      q: typeof search.q === "string" ? search.q : "",
      status: parseStringArray(search.status),
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

function voteStatusDate(student: Student): string | null {
  switch (resolveVoteStatus(student)) {
    case "submitted":
      return student.voteSubmittedAt;
    case "opened":
      return student.voteOpenedAt;
    case "sent":
      return student.voteCodeSentAt;
    case "none":
      return null;
  }
}

function SurveyStudentsPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const navigate = Route.useNavigate();
  const { q = "", status = [], sort: sortKey, dir } = Route.useSearch();
  // Default: worst-to-best status (same order as before), now just the
  // initial sort — any column stays clickable to override it.
  const sort: SortState = sortKey && dir ? { key: sortKey, dir } : { key: "status", dir: "asc" };

  const { data: students, isLoading } = useQuery({
    ...trpc.students.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const filters: FilterConfig<Student>[] = [
    {
      key: "status",
      label: "Voting-Status",
      options: VOTE_STATUS_ORDER.map((s) => ({ value: s, label: VOTE_STATUS_LABEL[s] })),
      match: (student, selected) => selected.includes(resolveVoteStatus(student)),
    },
  ];
  const activeFilters = { status };
  const filteredStudents = useListFilter({
    items: students ?? [],
    query: q,
    searchText: (student) =>
      `${student.name} ${student.email} ${student.email2 ?? ""} ${student.groupName ?? ""}`,
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
        case "group":
          return student.groupName ?? "";
        case "status":
          return VOTE_STATUS_SORT_ORDER.indexOf(resolveVoteStatus(student));
        case "date":
          return voteStatusDate(student) ?? "";
        default:
          return null;
      }
    },
  });

  function setQuery(value: string) {
    navigate({
      search: (prev) =>
        pruneEmpty({ q: value, status: prev.status ?? [], sort: prev.sort ?? "", dir: prev.dir }),
      replace: true,
    });
  }

  function setFilter(key: string, values: string[]) {
    navigate({
      search: (prev) =>
        pruneEmpty({
          q: prev.q ?? "",
          status: prev.status ?? [],
          sort: prev.sort ?? "",
          dir: prev.dir,
          [key]: values,
        }) as SurveyStudentsSearch,
      replace: true,
    });
  }

  function handleSort(key: string) {
    const next = toggleSort(sort, key);
    navigate({
      search: (prev) =>
        pruneEmpty({ q: prev.q ?? "", status: prev.status ?? [], sort: next?.key ?? "", dir: next?.dir }),
      replace: true,
    });
  }

  // Looked up by id from the live query result (rather than snapshotting the
  // Student object at click time) so the preferences modal picks up changes
  // made while it's open — e.g. regenerating the voting code invalidates
  // `students.list`, and the modal should show the new code immediately.
  const [selectedStudentId, setSelectedStudentId] = useState<string | undefined>();
  const selectedStudent = students?.find((student) => student.id === selectedStudentId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [resendStudent, setResendStudent] = useState<Student | undefined>();
  const [resendDialogOpen, setResendDialogOpen] = useState(false);

  const [regenerateStudent, setRegenerateStudent] = useState<Student | undefined>();
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);

  function openStudent(student: Student) {
    setSelectedStudentId(student.id);
    setDialogOpen(true);
  }

  function openResend(student: Student) {
    setResendStudent(student);
    setResendDialogOpen(true);
  }

  function openRegenerate(student: Student) {
    setRegenerateStudent(student);
    setRegenerateDialogOpen(true);
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
                Status
              </SortableTableHead>
              <SortableTableHead sortKey="date" currentSort={sort} onSort={handleSort}>
                Datum
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStudents.map((student) => {
              const statusDate = voteStatusDate(student);
              return (
                <TableRow
                  key={student.id}
                  onClick={() => openStudent(student)}
                  className={cn("cursor-pointer", VOTE_STATUS_ROW_COLOR[resolveVoteStatus(student)])}
                >
                  <TableCell className="font-medium">{student.name}</TableCell>
                  <TableCell className="text-muted-foreground">{student.email}</TableCell>
                  <TableCell className="text-muted-foreground">{student.groupName || "–"}</TableCell>
                  <TableCell
                    className={cn(
                      "text-muted-foreground",
                      student.voteSubmittedAt && "text-foreground",
                    )}
                  >
                    {VOTE_STATUS_LABEL[resolveVoteStatus(student)]}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {statusDate ? formatDateTime(statusDate) : "–"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {projectId && (
        <StudentPreferencesDialog
          projectId={projectId}
          student={selectedStudent}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onResend={() => selectedStudent && openResend(selectedStudent)}
          onRegenerate={() => selectedStudent && openRegenerate(selectedStudent)}
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

      {projectId && (
        <RegenerateCodeDialog
          projectId={projectId}
          student={regenerateStudent}
          open={regenerateDialogOpen}
          onOpenChange={setRegenerateDialogOpen}
        />
      )}
    </div>
  );
}
