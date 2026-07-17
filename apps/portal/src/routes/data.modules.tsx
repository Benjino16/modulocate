import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";
import { ModuleDialog } from "../components/ModuleDialog";

export const Route = createFileRoute("/data/modules")({
  component: ModulesPage,
});

type Module = {
  id: string;
  name: string;
  description: string | null;
  teacher: string | null;
  scheduleLabel: string | null;
  min: number;
  max: number;
};

function ModulesPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const { data: modules, isLoading } = useQuery({
    ...trpc.modules.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const [editingModule, setEditingModule] = useState<Module | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  function openCreate() {
    setEditingModule(undefined);
    setDialogOpen(true);
  }

  function openEdit(module: Module) {
    setEditingModule(module);
    setDialogOpen(true);
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
            <button
              key={module.id}
              type="button"
              onClick={() => openEdit(module)}
              className="flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
            >
              <h3 className="font-semibold">{module.name}</h3>
              <p className="text-sm text-muted-foreground">
                {module.scheduleLabel || "Kein Termin festgelegt"}
              </p>
              <p className="text-sm text-muted-foreground">Max. {module.max} Teilnehmer</p>
              <p className="text-sm text-muted-foreground">{module.teacher || "Kein Lehrer zugeteilt"}</p>
            </button>
          ))}
        </div>
      )}

      {projectId && (
        <ModuleDialog
          projectId={projectId}
          module={editingModule}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}
