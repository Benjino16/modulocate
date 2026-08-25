import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { pruneEmpty } from "@modulocate/ui/lib/use-list-filter";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";
import { useDialogSearchParam } from "../lib/use-dialog-search-param";
import { DateDialog } from "../components/DateDialog";

// dateId doubles as DateDialog's open state — see use-dialog-search-param.ts.
// Sentinel "new" is the create flow.
type DatesSearch = { dateId?: string };

export const Route = createFileRoute("/data/dates")({
  component: DatesPage,
  validateSearch: (search: Record<string, unknown>): DatesSearch =>
    pruneEmpty({ dateId: typeof search.dateId === "string" ? search.dateId : "" }),
});

type EventDate = { id: string; name: string; moduleCount?: number };

function DatesPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const navigate = Route.useNavigate();
  const { dateId } = Route.useSearch();
  const { data: dates, isLoading } = useQuery({
    ...trpc.dates.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  function setDateId(id: string | undefined, { push }: { push: boolean }) {
    navigate({ search: (prev) => pruneEmpty({ ...prev, dateId: id }), replace: !push });
  }

  const dialog = useDialogSearchParam(dateId, setDateId);
  const editingDate = dateId && dateId !== "new" ? dates?.find((d) => d.id === dateId) : undefined;

  useEffect(() => {
    if (!dates || !dateId || dateId === "new") return;
    if (!dates.some((d) => d.id === dateId)) setDateId(undefined, { push: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates, dateId]);

  function openCreate() {
    dialog.open("new");
  }

  function openEdit(date: EventDate) {
    dialog.open(date.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Termine</h2>
        <Button size="sm" onClick={openCreate} disabled={!projectId}>
          <Plus /> Neuer Termin
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Lade Termine…</p>}
      {!isLoading && !dates?.length && (
        <p className="text-muted-foreground">Noch keine Termine angelegt.</p>
      )}

      {!!dates?.length && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {dates.map((date) => (
            <button
              key={date.id}
              type="button"
              onClick={() => openEdit(date)}
              className="flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
            >
              <span className="font-semibold">{date.name}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {date.moduleCount ?? 0} Module
              </span>
            </button>
          ))}
        </div>
      )}

      {projectId && (
        <DateDialog
          projectId={projectId}
          date={editingDate}
          open={dialog.isOpen}
          onOpenChange={dialog.onOpenChange}
        />
      )}
    </div>
  );
}
