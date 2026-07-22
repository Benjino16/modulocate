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
import { RichTextEditor } from "@modulocate/ui/components/rich-text-editor";
import { useTRPC } from "../trpc";

type Module = {
  id: string;
  name: string;
  description: string | null;
};

type FormState = {
  name: string;
  description: string;
};

function formStateFor(module: Module): FormState {
  return {
    name: module.name,
    description: module.description ?? "",
  };
}

// The "standard" menu teachers reach by clicking a module tile — content only
// (name/description). Everything else (teacher, schedule, capacity,
// categories) lives in ModuleDialog, reached via the tile's gear icon.
export function ModuleContentDialog({
  projectId,
  module,
  open,
  onOpenChange,
}: {
  projectId: string;
  module: Module;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => formStateFor(module));
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setForm(formStateFor(module));
      setError(undefined);
    }
  }, [open, module]);

  const updateModule = useMutation(
    trpc.modules.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.modules.list.queryKey({ projectId }) });
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (!form.name.trim()) return setError("Name wird benötigt.");

    updateModule.mutate({
      id: module.id,
      projectId,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modul bearbeiten</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="module-content-name">Name</Label>
            <Input
              id="module-content-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="module-content-description">Beschreibung</Label>
            <RichTextEditor
              id="module-content-description"
              value={form.description}
              onChange={(description) => setForm({ ...form, description })}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={updateModule.isPending}>
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
