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

type Rule = { id: string; name: string };

export function RuleDialog({
  projectId,
  rule,
  open,
  onOpenChange,
}: {
  projectId: string;
  rule?: Rule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState(rule?.name ?? "");
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setName(rule?.name ?? "");
      setError(undefined);
    }
  }, [open, rule]);

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: trpc.rules.list.queryKey({ projectId }) });

  const createRule = useMutation(
    trpc.rules.create.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const updateRule = useMutation(
    trpc.rules.update.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const removeRule = useMutation(
    trpc.rules.remove.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const isPending = createRule.isPending || updateRule.isPending || removeRule.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (!name.trim()) return setError("Name wird benötigt.");

    if (rule) {
      updateRule.mutate({ id: rule.id, projectId, name: name.trim() });
    } else {
      createRule.mutate({ projectId, name: name.trim() });
    }
  }

  function handleDelete() {
    if (!rule) return;
    if (!window.confirm(`Regel "${rule.name}" wirklich löschen?`)) return;
    removeRule.mutate({ id: rule.id, projectId });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rule ? "Regel bearbeiten" : "Neue Regel"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="items-center sm:justify-between">
            {rule ? (
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
              {rule ? "Speichern" : "Regel anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
