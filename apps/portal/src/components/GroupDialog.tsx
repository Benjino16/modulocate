import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@modulocate/ui/components/select";
import { useTRPC } from "../trpc";

type Group = { id: string; name: string; ruleId: string | null };

const NO_RULE = "none";

type FormState = { name: string; ruleId: string };

function formStateFor(group: Group | undefined): FormState {
  if (!group) return { name: "", ruleId: NO_RULE };
  return { name: group.name, ruleId: group.ruleId ?? NO_RULE };
}

export function GroupDialog({
  projectId,
  group,
  open,
  onOpenChange,
}: {
  projectId: string;
  group?: Group;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => formStateFor(group));
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setForm(formStateFor(group));
      setError(undefined);
    }
  }, [open, group]);

  const { data: rules } = useQuery({
    ...trpc.rules.list.queryOptions({ projectId }),
    enabled: open,
  });

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: trpc.studentGroups.list.queryKey({ projectId }) });

  const createGroup = useMutation(
    trpc.studentGroups.create.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const updateGroup = useMutation(
    trpc.studentGroups.update.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const removeGroup = useMutation(
    trpc.studentGroups.remove.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const isPending = createGroup.isPending || updateGroup.isPending || removeGroup.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (!form.name.trim()) return setError("Name wird benötigt.");

    const payload = {
      projectId,
      name: form.name.trim(),
      ruleId: form.ruleId === NO_RULE ? null : form.ruleId,
    };

    if (group) {
      updateGroup.mutate({ id: group.id, ...payload });
    } else {
      createGroup.mutate(payload);
    }
  }

  function handleDelete() {
    if (!group) return;
    if (!window.confirm(`Gruppe "${group.name}" wirklich löschen?`)) return;
    removeGroup.mutate({ id: group.id, projectId });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{group ? "Gruppe bearbeiten" : "Neue Gruppe"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-rule">Regel</Label>
            <Select value={form.ruleId} onValueChange={(ruleId) => setForm({ ...form, ruleId })}>
              <SelectTrigger id="group-rule">
                <SelectValue placeholder="Keine Regel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_RULE}>Keine Regel</SelectItem>
                {rules?.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="items-center sm:justify-between">
            {group ? (
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
              {group ? "Speichern" : "Gruppe anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
