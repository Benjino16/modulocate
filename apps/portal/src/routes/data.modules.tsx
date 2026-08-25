import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings, Download, Upload } from "lucide-react";
import { moduleImportFile } from "@modulocate/shared";
import { Button } from "@modulocate/ui/components/button";
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
import { useTRPC, trpcClient } from "../trpc";
import { useProject } from "../lib/use-project";
import { useDialogSearchParam } from "../lib/use-dialog-search-param";
import { ModuleDialog } from "../components/ModuleDialog";
import { ModuleContentDialog } from "../components/ModuleContentDialog";

// Optional keys so an empty search/filter/sort state serializes to no query
// params at all, instead of leaving "?q=&category=&sort=" around by default.
// moduleId/moduleSettingsId double as the open-state for ModuleContentDialog
// and ModuleDialog — see use-dialog-search-param.ts. moduleSettingsId uses
// the sentinel "new" for the create-module flow (no module to key on yet).
type ModulesSearch = {
  q?: string;
  category?: string[];
  date?: string[];
  sort?: string;
  dir?: SortDirection;
  moduleId?: string;
  moduleSettingsId?: string;
};

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function parseSortDir(value: unknown): SortDirection | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

export const Route = createFileRoute("/data/modules")({
  component: ModulesPage,
  validateSearch: (search: Record<string, unknown>): ModulesSearch =>
    pruneEmpty({
      q: typeof search.q === "string" ? search.q : "",
      category: parseStringArray(search.category),
      date: parseStringArray(search.date),
      sort: typeof search.sort === "string" ? search.sort : "",
      dir: parseSortDir(search.dir),
      moduleId: typeof search.moduleId === "string" ? search.moduleId : "",
      moduleSettingsId: typeof search.moduleSettingsId === "string" ? search.moduleSettingsId : "",
    }),
});

type Module = {
  id: string;
  name: string;
  description: string | null;
  teacher: string | null;
  scheduleLabel: string | null;
  displayScheduleLabel: string | null;
  min: number;
  max: number;
  categoryIds: string[];
  dateIds: string[];
};

function ModulesPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { projectId } = useProject();
  const navigate = Route.useNavigate();
  const {
    q = "",
    category = [],
    date = [],
    sort: sortKey,
    dir,
    moduleId,
    moduleSettingsId,
  } = Route.useSearch();
  const sort: SortState = sortKey && dir ? { key: sortKey, dir } : null;
  const { data: modules, isLoading } = useQuery({
    ...trpc.modules.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const { data: categories } = useQuery({
    ...trpc.moduleCategories.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const { data: dates } = useQuery({
    ...trpc.dates.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const filters: FilterConfig<Module>[] = [
    {
      key: "category",
      label: "Kategorie",
      options: (categories ?? []).map((c) => ({ value: c.id, label: c.name })),
      match: (module, selected) => selected.some((id) => module.categoryIds.includes(id)),
    },
    {
      key: "date",
      label: "Termin",
      options: (dates ?? []).map((d) => ({ value: d.id, label: d.name })),
      match: (module, selected) => selected.some((id) => module.dateIds.includes(id)),
    },
  ];
  const activeFilters = { category, date };
  const filteredModules = useListFilter({
    items: modules ?? [],
    query: q,
    searchText: (module) => `${module.name} ${module.teacher ?? ""} ${module.description ?? ""}`,
    filters,
    activeFilters,
  });
  const sortedModules = useTableSort({
    items: filteredModules,
    sort,
    sortValue: (module, key) => {
      switch (key) {
        case "name":
          return module.name;
        case "schedule":
          return module.displayScheduleLabel ?? "";
        case "max":
          return module.max;
        case "teacher":
          return module.teacher ?? "";
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
      search: (prev) => pruneEmpty({ ...prev, [key]: values }) as ModulesSearch,
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

  // Push a new history entry when opening (so the back button closes the
  // dialog), replace in place for everything else — see useDialogSearchParam.
  function setModuleId(id: string | undefined, { push }: { push: boolean }) {
    navigate({ search: (prev) => pruneEmpty({ ...prev, moduleId: id }), replace: !push });
  }

  function setModuleSettingsId(id: string | undefined, { push }: { push: boolean }) {
    navigate({ search: (prev) => pruneEmpty({ ...prev, moduleSettingsId: id }), replace: !push });
  }

  const contentDialog = useDialogSearchParam(moduleId, setModuleId);
  const settingsDialog = useDialogSearchParam(moduleSettingsId, setModuleSettingsId);
  const contentModule = modules?.find((m) => m.id === moduleId);
  const settingsModule =
    moduleSettingsId && moduleSettingsId !== "new" ? modules?.find((m) => m.id === moduleSettingsId) : undefined;

  // A deep-linked/reloaded moduleId or moduleSettingsId that no longer
  // matches any module (deleted, or just a bad link) falls back to the
  // plain list instead of leaving the dialog stuck open with nothing to show.
  useEffect(() => {
    if (!modules) return;
    if (moduleId && !modules.some((m) => m.id === moduleId)) {
      setModuleId(undefined, { push: false });
    }
    if (moduleSettingsId && moduleSettingsId !== "new" && !modules.some((m) => m.id === moduleSettingsId)) {
      setModuleSettingsId(undefined, { push: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, moduleId, moduleSettingsId]);

  const [isExporting, setIsExporting] = useState(false);
  const [importExportError, setImportExportError] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importModules = useMutation(
    trpc.modules.importBatch.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.modules.list.queryKey({ projectId: projectId! }) });
      },
      onError: (err) => setImportExportError(err.message),
    }),
  );

  async function handleExport() {
    if (!projectId) return;
    setImportExportError(undefined);
    setIsExporting(true);
    try {
      const data = await trpcClient.modules.exportAll.query({ projectId });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `module-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setImportExportError(err instanceof Error ? err.message : "Fehler beim Exportieren.");
    } finally {
      setIsExporting(false);
    }
  }

  function openImportPicker() {
    setImportExportError(undefined);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again still fires onChange.
    e.target.value = "";
    if (!file || !projectId) return;

    setImportExportError(undefined);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setImportExportError("Datei ist kein gültiges JSON.");
      return;
    }

    const result = moduleImportFile.safeParse(parsed);
    if (!result.success) {
      setImportExportError("Datei entspricht nicht dem erwarteten Export-Format.");
      return;
    }

    importModules.mutate({ ...result.data, projectId });
  }

  function openCreate() {
    settingsDialog.open("new");
  }

  function openSettings(module: Module) {
    settingsDialog.open(module.id);
  }

  function openContent(module: Module) {
    contentDialog.open(module.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Module</h2>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={openImportPicker}
            disabled={!projectId || importModules.isPending}
          >
            <Upload /> Importieren
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExport}
            disabled={!projectId || !modules?.length || isExporting}
          >
            <Download /> Exportieren
          </Button>
          <Button size="sm" onClick={openCreate} disabled={!projectId}>
            <Plus /> Neues Modul
          </Button>
        </div>
      </div>

      {importExportError && <p className="text-sm text-destructive">{importExportError}</p>}

      {!isLoading && !!modules?.length && (
        <SearchFilterBar
          query={q}
          onQueryChange={setQuery}
          searchPlaceholder="Module durchsuchen…"
          filters={filters}
          activeFilters={activeFilters}
          onFilterChange={setFilter}
        />
      )}

      {isLoading && <p className="text-muted-foreground">Lade Module…</p>}
      {!isLoading && !modules?.length && (
        <p className="text-muted-foreground">Noch keine Module angelegt.</p>
      )}
      {!isLoading && !!modules?.length && !filteredModules.length && (
        <p className="text-muted-foreground">Keine Module entsprechen der Suche/den Filtern.</p>
      )}

      {!!sortedModules.length && (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="name" currentSort={sort} onSort={handleSort}>
                Name
              </SortableTableHead>
              <SortableTableHead sortKey="schedule" currentSort={sort} onSort={handleSort}>
                Termin
              </SortableTableHead>
              <SortableTableHead sortKey="max" currentSort={sort} onSort={handleSort}>
                Max. Teilnehmer
              </SortableTableHead>
              <SortableTableHead sortKey="teacher" currentSort={sort} onSort={handleSort}>
                Lehrer
              </SortableTableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedModules.map((module) => (
              <TableRow
                key={module.id}
                onClick={() => openContent(module)}
                className="group cursor-pointer"
              >
                <TableCell className="font-medium">{module.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {module.displayScheduleLabel || "–"}
                </TableCell>
                <TableCell className="text-muted-foreground">{module.max}</TableCell>
                <TableCell className="text-muted-foreground">{module.teacher || "–"}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openSettings(module);
                    }}
                    aria-label="Moduleinstellungen"
                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <Settings className="size-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {projectId && (
        <ModuleDialog
          projectId={projectId}
          module={settingsModule}
          open={settingsDialog.isOpen}
          onOpenChange={settingsDialog.onOpenChange}
          onDuplicated={(created) => setModuleSettingsId(created.id, { push: false })}
        />
      )}

      {projectId && contentModule && (
        <ModuleContentDialog
          projectId={projectId}
          module={contentModule}
          open={contentDialog.isOpen}
          onOpenChange={contentDialog.onOpenChange}
        />
      )}
    </div>
  );
}
