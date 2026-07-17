import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";
import { GroupDialog } from "../components/GroupDialog";

export const Route = createFileRoute("/data/groups")({
  component: GroupsPage,
});

type Group = { id: string; name: string; ruleId: string | null };

function GroupsPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const { data: groups, isLoading } = useQuery({
    ...trpc.studentGroups.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const [editingGroup, setEditingGroup] = useState<Group | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  function openCreate() {
    setEditingGroup(undefined);
    setDialogOpen(true);
  }

  function openEdit(group: Group) {
    setEditingGroup(group);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Gruppen</h2>
        <Button size="sm" onClick={openCreate} disabled={!projectId}>
          <Plus /> Neue Gruppe
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Lade Gruppen…</p>}
      {!isLoading && !groups?.length && (
        <p className="text-muted-foreground">Noch keine Gruppen angelegt.</p>
      )}

      {!!groups?.length && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => openEdit(group)}
              className="rounded-lg border p-4 text-left font-semibold transition-colors hover:bg-accent"
            >
              {group.name}
            </button>
          ))}
        </div>
      )}

      {projectId && (
        <GroupDialog
          projectId={projectId}
          group={editingGroup}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}
