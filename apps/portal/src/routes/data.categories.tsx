import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";
import { CategoryDialog } from "../components/CategoryDialog";

export const Route = createFileRoute("/data/categories")({
  component: CategoriesPage,
});

type Category = { id: string; name: string };

function CategoriesPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const { data: categories, isLoading } = useQuery({
    ...trpc.moduleCategories.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const { data: modules } = useQuery({
    ...trpc.modules.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const statsByCategory = new Map<string, { moduleCount: number; seatCount: number }>();
  for (const module of modules ?? []) {
    for (const categoryId of module.categoryIds) {
      const stats = statsByCategory.get(categoryId) ?? { moduleCount: 0, seatCount: 0 };
      stats.moduleCount += 1;
      stats.seatCount += module.max;
      statsByCategory.set(categoryId, stats);
    }
  }

  const [editingCategory, setEditingCategory] = useState<Category | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  function openCreate() {
    setEditingCategory(undefined);
    setDialogOpen(true);
  }

  function openEdit(category: Category) {
    setEditingCategory(category);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Kategorien</h2>
        <Button size="sm" onClick={openCreate} disabled={!projectId}>
          <Plus /> Neue Kategorie
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Lade Kategorien…</p>}
      {!isLoading && !categories?.length && (
        <p className="text-muted-foreground">Noch keine Kategorien angelegt.</p>
      )}

      {!!categories?.length && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {categories.map((category) => {
            const stats = statsByCategory.get(category.id) ?? { moduleCount: 0, seatCount: 0 };
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => openEdit(category)}
                className="rounded-lg border p-4 text-left transition-colors hover:bg-accent"
              >
                <p className="font-semibold">{category.name}</p>
                <p className="text-sm text-muted-foreground">{stats.moduleCount} Module</p>
                <p className="text-sm text-muted-foreground">{stats.seatCount} Plätze</p>
              </button>
            );
          })}
        </div>
      )}

      {projectId && (
        <CategoryDialog
          projectId={projectId}
          category={editingCategory}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}
