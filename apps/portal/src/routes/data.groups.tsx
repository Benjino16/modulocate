import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { pruneEmpty } from "@modulocate/ui/lib/use-list-filter";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";
import { useDialogSearchParam } from "../lib/use-dialog-search-param";
import { GroupDialog } from "../components/GroupDialog";

// groupId doubles as GroupDialog's open state — see use-dialog-search-param.ts.
// Sentinel "new" is the create flow.
type GroupsSearch = { groupId?: string };

export const Route = createFileRoute("/data/groups")({
  component: GroupsPage,
  validateSearch: (search: Record<string, unknown>): GroupsSearch =>
    pruneEmpty({ groupId: typeof search.groupId === "string" ? search.groupId : "" }),
});

type Group = { id: string; name: string; ruleId: string | null; studentCount?: number };

function GroupsPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const navigate = Route.useNavigate();
  const { groupId } = Route.useSearch();
  const { data: groups, isLoading } = useQuery({
    ...trpc.studentGroups.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  function setGroupId(id: string | undefined, { push }: { push: boolean }) {
    navigate({ search: (prev) => pruneEmpty({ ...prev, groupId: id }), replace: !push });
  }

  const dialog = useDialogSearchParam(groupId, setGroupId);
  const editingGroup = groupId && groupId !== "new" ? groups?.find((g) => g.id === groupId) : undefined;

  useEffect(() => {
    if (!groups || !groupId || groupId === "new") return;
    if (!groups.some((g) => g.id === groupId)) setGroupId(undefined, { push: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, groupId]);

  function openCreate() {
    dialog.open("new");
  }

  function openEdit(group: Group) {
    dialog.open(group.id);
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
              className="flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
            >
              <span className="font-semibold">{group.name}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {group.studentCount ?? 0} Schüler
              </span>
            </button>
          ))}
        </div>
      )}

      {projectId && (
        <GroupDialog
          projectId={projectId}
          group={editingGroup}
          open={dialog.isOpen}
          onOpenChange={dialog.onOpenChange}
        />
      )}
    </div>
  );
}
