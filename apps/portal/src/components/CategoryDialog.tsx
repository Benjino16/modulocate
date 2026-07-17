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

type Category = { id: string; name: string };

export function CategoryDialog({
  projectId,
  category,
  open,
  onOpenChange,
}: {
  projectId: string;
  category?: Category;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState(category?.name ?? "");
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setError(undefined);
    }
  }, [open, category]);

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: trpc.moduleCategories.list.queryKey({ projectId }) });

  const createCategory = useMutation(
    trpc.moduleCategories.create.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const updateCategory = useMutation(
    trpc.moduleCategories.update.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const removeCategory = useMutation(
    trpc.moduleCategories.remove.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const isPending = createCategory.isPending || updateCategory.isPending || removeCategory.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (!name.trim()) return setError("Name wird benötigt.");

    if (category) {
      updateCategory.mutate({ id: category.id, projectId, name: name.trim() });
    } else {
      createCategory.mutate({ projectId, name: name.trim() });
    }
  }

  function handleDelete() {
    if (!category) return;
    if (!window.confirm(`Kategorie "${category.name}" wirklich löschen?`)) return;
    removeCategory.mutate({ id: category.id, projectId });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? "Kategorie bearbeiten" : "Neue Kategorie"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-name">Name</Label>
            <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="items-center sm:justify-between">
            {category ? (
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
              {category ? "Speichern" : "Kategorie anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
