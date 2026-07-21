import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";
import { ModuleDialog } from "../components/ModuleDialog";
import { ModuleContentDialog } from "../components/ModuleContentDialog";

export const Route = createFileRoute("/data/modules")({
  component: ModulesPage,
});

type Module = {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  teacher: string | null;
  scheduleLabel: string | null;
  min: number;
  max: number;
  categoryIds: string[];
};

function ModulesPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const { data: modules, isLoading } = useQuery({
    ...trpc.modules.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

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

      {isLoading && <p className="text-muted-foreground">Lade Module…</p>}
      {!isLoading && !modules?.length && (
        <p className="text-muted-foreground">Noch keine Module angelegt.</p>
      )}

      {!!modules?.length && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {modules.map((module) => (
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
                {module.scheduleLabel || "Kein Termin festgelegt"}
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
