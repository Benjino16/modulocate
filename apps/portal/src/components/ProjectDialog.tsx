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

export function ProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (projectId: string) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setName("");
      setError(undefined);
    }
  }, [open]);

  const createProject = useMutation(
    trpc.projects.create.mutationOptions({
      onSuccess: (project) => {
        queryClient.invalidateQueries({ queryKey: trpc.projects.list.queryKey() });
        onOpenChange(false);
        onCreated(project.id);
      },
      onError: (err) => setError(err.message),
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!name.trim()) return setError("Name wird benötigt.");
    createProject.mutate({ name: name.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neues Projekt</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={createProject.isPending}>
              Projekt anlegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
