import { useEffect } from "react";
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
import { useListFilter, pruneEmpty } from "@modulocate/ui/lib/use-list-filter";
import { useTableSort, toggleSort, type SortState, type SortDirection } from "@modulocate/ui/lib/use-table-sort";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";
import { useDialogSearchParam } from "../lib/use-dialog-search-param";
import { ModuleRosterDialog } from "../components/ModuleRosterDialog";
import { CapacityBar } from "../components/CapacityBar";

// Optional keys so an empty search/sort state serializes to no query params
// at all, instead of leaving "?q=&sort=" around by default. moduleId doubles
// as ModuleRosterDialog's open state — see use-dialog-search-param.ts.
type ModulesSearch = { q?: string; sort?: string; dir?: SortDirection; moduleId?: string };

function parseSortDir(value: unknown): SortDirection | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

export const Route = createFileRoute("/adjustments/modules")({
  component: AdjustmentsModulesPage,
  validateSearch: (search: Record<string, unknown>): ModulesSearch =>
    pruneEmpty({
      q: typeof search.q === "string" ? search.q : "",
      sort: typeof search.sort === "string" ? search.sort : "",
      dir: parseSortDir(search.dir),
      moduleId: typeof search.moduleId === "string" ? search.moduleId : "",
    }),
});

type Module = {
  id: string;
  name: string;
  teacher: string | null;
  displayScheduleLabel: string | null;
  min: number;
  max: number;
  studentCount: number;
  medianPreference: number | null;
  demand: number | null;
};

function AdjustmentsModulesPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const navigate = Route.useNavigate();
  const { q = "", sort: sortKey, dir, moduleId } = Route.useSearch();
  // Default to fullest-first, same as before, but now just the initial
  // sort — any column stays clickable to override it.
  const sort: SortState = sortKey && dir ? { key: sortKey, dir } : { key: "fillRatio", dir: "desc" };

  const { data: modules, isLoading } = useQuery({
    ...trpc.modules.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const filteredModules = useListFilter({
    items: modules ?? [],
    query: q,
    searchText: (module) => `${module.name} ${module.teacher ?? ""} ${module.displayScheduleLabel ?? ""}`,
    activeFilters: {},
  });
  const sortedModules = useTableSort({
    items: filteredModules,
    sort,
    sortValue: (module, key) => {
      switch (key) {
        case "name":
          return module.name;
        case "teacher":
          return module.teacher ?? "";
        case "fillRatio":
          return fillRatio(module);
        case "medianPreference":
          return module.medianPreference;
        case "demand":
          return module.demand;
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

  function setModuleId(id: string | undefined, { push }: { push: boolean }) {
    navigate({ search: (prev) => pruneEmpty({ ...prev, moduleId: id }), replace: !push });
  }

  const dialog = useDialogSearchParam(moduleId, setModuleId);
  const selectedModule = modules?.find((m) => m.id === moduleId);

  useEffect(() => {
    if (!modules || !moduleId) return;
    if (!modules.some((m) => m.id === moduleId)) setModuleId(undefined, { push: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, moduleId]);

  function openRoster(module: Module) {
    dialog.open(module.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Module</h2>

      {!isLoading && !!modules?.length && (
        <SearchFilterBar
          query={q}
          onQueryChange={setQuery}
          searchPlaceholder="Module durchsuchen…"
          activeFilters={{}}
          onFilterChange={() => {}}
        />
      )}

      {isLoading && <p className="text-muted-foreground">Lade Module…</p>}
      {!isLoading && !modules?.length && (
        <p className="text-muted-foreground">Noch keine Module angelegt.</p>
      )}
      {!isLoading && !!modules?.length && !filteredModules.length && (
        <p className="text-muted-foreground">Keine Module entsprechen der Suche.</p>
      )}

      {!!sortedModules.length && (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="name" currentSort={sort} onSort={handleSort}>
                Name
              </SortableTableHead>
              <TableHead>Datum</TableHead>
              <SortableTableHead sortKey="teacher" currentSort={sort} onSort={handleSort}>
                Lehrer
              </SortableTableHead>
              <SortableTableHead sortKey="fillRatio" currentSort={sort} onSort={handleSort}>
                Belegung
              </SortableTableHead>
              <SortableTableHead
                sortKey="medianPreference"
                currentSort={sort}
                onSort={handleSort}
                title="Median der Präferenz-Ränge der zugewiesenen Schüler (1 = Erstwunsch)"
              >
                Median-Prio
              </SortableTableHead>
              <SortableTableHead
                sortKey="demand"
                currentSort={sort}
                onSort={handleSort}
                title="Anzahl Schüler, die der Algorithmus beim letzten Zuteilungslauf mangels Kapazität für dieses Modul abgelehnt hat"
              >
                Nachfrage
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedModules.map((module) => (
              <TableRow key={module.id} onClick={() => openRoster(module)} className="cursor-pointer">
                <TableCell className="font-medium">{module.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {module.displayScheduleLabel || "–"}
                </TableCell>
                <TableCell className="text-muted-foreground">{module.teacher || "–"}</TableCell>
                <TableCell>
                  <CapacityBar studentCount={module.studentCount} min={module.min} max={module.max} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {module.medianPreference ?? "–"}
                </TableCell>
                <TableCell className="text-muted-foreground">{module.demand ?? "–"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {projectId && (
        <ModuleRosterDialog
          projectId={projectId}
          module={selectedModule}
          open={dialog.isOpen}
          onOpenChange={dialog.onOpenChange}
        />
      )}
    </div>
  );
}

function fillRatio(module: Module) {
  return module.max > 0 ? module.studentCount / module.max : 0;
}
