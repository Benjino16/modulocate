import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { pruneEmpty } from "@modulocate/ui/lib/use-list-filter";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";
import { useDialogSearchParam } from "../lib/use-dialog-search-param";
import { CategoryDialog } from "../components/CategoryDialog";

// categoryId doubles as CategoryDialog's open state — see
// use-dialog-search-param.ts. Sentinel "new" is the create flow.
type CategoriesSearch = { categoryId?: string };

export const Route = createFileRoute("/data/categories")({
  component: CategoriesPage,
  validateSearch: (search: Record<string, unknown>): CategoriesSearch =>
    pruneEmpty({ categoryId: typeof search.categoryId === "string" ? search.categoryId : "" }),
});

type Category = { id: string; name: string; hiddenInVote: boolean };

function CategoriesPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const navigate = Route.useNavigate();
  const { categoryId } = Route.useSearch();
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

  function setCategoryId(id: string | undefined, { push }: { push: boolean }) {
    navigate({ search: (prev) => pruneEmpty({ ...prev, categoryId: id }), replace: !push });
  }

  const dialog = useDialogSearchParam(categoryId, setCategoryId);
  const editingCategory =
    categoryId && categoryId !== "new" ? categories?.find((c) => c.id === categoryId) : undefined;

  useEffect(() => {
    if (!categories || !categoryId || categoryId === "new") return;
    if (!categories.some((c) => c.id === categoryId)) setCategoryId(undefined, { push: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, categoryId]);

  function openCreate() {
    dialog.open("new");
  }

  function openEdit(category: Category) {
    dialog.open(category.id);
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
                {category.hiddenInVote && (
                  <p className="text-sm text-muted-foreground">In der Umfrage ausgeblendet</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {projectId && (
        <CategoryDialog
          projectId={projectId}
          category={editingCategory}
          open={dialog.isOpen}
          onOpenChange={dialog.onOpenChange}
        />
      )}
    </div>
  );
}
