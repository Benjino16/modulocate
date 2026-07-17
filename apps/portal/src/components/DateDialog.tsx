import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@modulocate/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@modulocate/ui/components/dialog";
import { Input } from "@modulocate/ui/components/input";
import { Label } from "@modulocate/ui/components/label";
import { useTRPC } from "../trpc";

type EventDate = { id: string; name: string };

export function DateDialog({
  projectId,
  date,
  open,
  onOpenChange,
}: {
  projectId: string;
  date?: EventDate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState(date?.name ?? "");
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setName(date?.name ?? "");
      setError(undefined);
    }
  }, [open, date]);

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: trpc.dates.list.queryKey({ projectId }) });

  const createDate = useMutation(
    trpc.dates.create.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const updateDate = useMutation(
    trpc.dates.update.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const removeDate = useMutation(
    trpc.dates.remove.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const isPending = createDate.isPending || updateDate.isPending || removeDate.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (!name.trim()) return setError("Name wird benötigt.");

    if (date) {
      updateDate.mutate({ id: date.id, projectId, name: name.trim() });
    } else {
      createDate.mutate({ projectId, name: name.trim() });
    }
  }

  function handleDelete() {
    if (!date) return;
    if (!window.confirm(`Termin "${date.name}" wirklich löschen?`)) return;
    removeDate.mutate({ id: date.id, projectId });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{date ? "Termin bearbeiten" : "Neuer Termin"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date-name">Name</Label>
            <Input id="date-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="items-center sm:justify-between">
            {date ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isPending}
                className="sm:mr-auto"
              >
                Löschen
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={isPending}>
              {date ? "Speichern" : "Termin anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
