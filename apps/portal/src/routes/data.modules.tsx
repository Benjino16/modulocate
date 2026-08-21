import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { SearchFilterBar } from "@modulocate/ui/components/search-filter-bar";
import { useListFilter, pruneEmpty, type FilterConfig } from "@modulocate/ui/lib/use-list-filter";
import { useTRPC } from "../trpc";
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
        <Button size="sm" onClick={openCreate} disabled={!projectId}>
          <Plus /> Neues Modul
        </Button>
      </div>

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
