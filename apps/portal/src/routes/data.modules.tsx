import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";

export const Route = createFileRoute("/data/modules")({
  component: ModulesPage,
});

function ModulesPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const { data: modules, isLoading } = useQuery({
    ...trpc.modules.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  if (isLoading) return <p className="text-muted-foreground">Lade Module…</p>;
  if (!modules?.length) return <p className="text-muted-foreground">Noch keine Module angelegt.</p>;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
      {modules.map((module) => (
        <div key={module.id} className="rounded-lg border p-4">
          {module.pictureUrl ? (
            <img src={module.pictureUrl} alt="" className="mb-3 h-32 w-full rounded-md object-cover" />
          ) : (
            <div className="mb-3 flex h-32 w-full items-center justify-center rounded-md bg-secondary text-sm text-muted-foreground">
              Kein Bild
            </div>
          )}
          <h3 className="font-semibold">{module.name}</h3>
          {module.teacher && <p className="text-sm text-muted-foreground">{module.teacher}</p>}
          {module.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{module.description}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {module.min}–{module.max} Plätze
          </p>
        </div>
      ))}
    </div>
  );
}
