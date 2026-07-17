import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";
import { DateDialog } from "../components/DateDialog";

export const Route = createFileRoute("/data/dates")({
  component: DatesPage,
});

type EventDate = { id: string; name: string };

function DatesPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const { data: dates, isLoading } = useQuery({
    ...trpc.dates.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const [editingDate, setEditingDate] = useState<EventDate | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  function openCreate() {
    setEditingDate(undefined);
    setDialogOpen(true);
  }

  function openEdit(date: EventDate) {
    setEditingDate(date);
    setDialogOpen(true);
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
              className="rounded-lg border p-4 text-left font-semibold transition-colors hover:bg-accent"
            >
              {date.name}
            </button>
          ))}
        </div>
      )}

      {projectId && (
        <DateDialog
          projectId={projectId}
          date={editingDate}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}
