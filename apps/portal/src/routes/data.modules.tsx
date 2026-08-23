import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings, Download, Upload } from "lucide-react";
import { moduleImportFile } from "@modulocate/shared";
import { Button } from "@modulocate/ui/components/button";
import { SearchFilterBar } from "@modulocate/ui/components/search-filter-bar";
import { useListFilter, pruneEmpty, type FilterConfig } from "@modulocate/ui/lib/use-list-filter";
import { useTRPC, trpcClient } from "../trpc";
import { useProject } from "../lib/project-context";
import { ModuleDialog } from "../components/ModuleDialog";
import { ModuleContentDialog } from "../components/ModuleContentDialog";

// Optional keys so an empty search/filter state serializes to no query
// params at all, instead of leaving "?q=&category=" around by default.
type ModulesSearch = { q?: string; category?: string[]; date?: string[] };

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export const Route = createFileRoute("/data/modules")({
  component: ModulesPage,
  validateSearch: (search: Record<string, unknown>): ModulesSearch =>
    pruneEmpty({
      q: typeof search.q === "string" ? search.q : "",
      category: parseStringArray(search.category),
      date: parseStringArray(search.date),
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
  const { q = "", category = [], date = [] } = Route.useSearch();
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

  function setQuery(value: string) {
    navigate({
      search: (prev) => pruneEmpty({ q: value, category: prev.category ?? [], date: prev.date ?? [] }),
      replace: true,
    });
  }

  function setFilter(key: string, values: string[]) {
    navigate({
      search: (prev) =>
        pruneEmpty({ q: prev.q ?? "", category: prev.category ?? [], date: prev.date ?? [], [key]: values }) as ModulesSearch,
      replace: true,
    });
  }

  const [settingsModule, setSettingsModule] = useState<Module | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contentModule, setContentModule] = useState<Module | undefined>();
  const [contentOpen, setContentOpen] = useState(false);

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
    setSettingsModule(undefined);
    setSettingsOpen(true);
  }

  function openSettings(module: Module) {
    setSettingsModule(module);
    setSettingsOpen(true);
  }

  function openContent(module: Module) {
    setContentModule(module);
    setContentOpen(true);
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

      {!!filteredModules.length && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {filteredModules.map((module) => (
            // Not a <button> — it contains the nested settings <button>, and
            // buttons can't nest. role="button" + keyboard handling keeps it
            // accessible; group-hover reveals the gear icon.
            <div
              key={module.id}
              role="button"
              tabIndex={0}
              onClick={() => openContent(module)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openContent(module);
                }
              }}
              className="group relative flex cursor-pointer flex-col gap-1 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openSettings(module);
                }}
                aria-label="Moduleinstellungen"
                className="absolute top-2 right-2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <Settings className="size-4" />
              </button>

              <h3 className="pr-8 font-semibold">{module.name}</h3>
              <p className="text-sm text-muted-foreground">
                {module.displayScheduleLabel || "Kein Termin festgelegt"}
              </p>
              <p className="text-sm text-muted-foreground">Max. {module.max} Teilnehmer</p>
              <p className="text-sm text-muted-foreground">{module.teacher || "Kein Lehrer zugeteilt"}</p>
            </div>
          ))}
        </div>
      )}

      {projectId && (
        <ModuleDialog
          projectId={projectId}
          module={settingsModule}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onDuplicated={setSettingsModule}
        />
      )}

      {projectId && contentModule && (
        <ModuleContentDialog
          projectId={projectId}
          module={contentModule}
          open={contentOpen}
          onOpenChange={setContentOpen}
        />
      )}
    </div>
  );
}
