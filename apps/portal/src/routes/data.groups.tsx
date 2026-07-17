import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";

export const Route = createFileRoute("/data/groups")({
  component: GroupsPage,
});

function GroupsPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const { data: groups, isLoading } = useQuery({
    ...trpc.studentGroups.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  if (isLoading) return <p className="text-muted-foreground">Lade Gruppen…</p>;
  if (!groups?.length) return <p className="text-muted-foreground">Noch keine Gruppen angelegt.</p>;

  return (
    <ul className="divide-y rounded-lg border">
      {groups.map((group) => (
        <li key={group.id} className="px-4 py-3 font-medium">
          {group.name}
        </li>
      ))}
    </ul>
  );
}
