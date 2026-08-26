import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";

export const Route = createFileRoute("/adjustments/rules")({
  component: AdjustmentsRulesPage,
});

function AdjustmentsRulesPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const { data: rules, isLoading } = useQuery({
    ...trpc.rules.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Regeln</h2>

      {isLoading && <p className="text-muted-foreground">Lade Regeln…</p>}
      {!isLoading && !rules?.length && (
        <p className="text-muted-foreground">Noch keine Regeln angelegt.</p>
      )}

      {!!rules?.length && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {rules.map((rule) => (
            <div key={rule.id} className="flex flex-col gap-1 rounded-lg border p-4">
              <h3 className="font-semibold">{rule.name}</h3>
              <p className="text-muted-foreground text-sm">{rule.studentCount} Schüler</p>
              <p
                className="text-2xl font-semibold"
                title="Durchschnitt der Präferenz-Ränge, mit denen Schüler dieser Regel ihre zugewiesenen Module gerankt haben (1 = Erstwunsch)"
              >
                {rule.averagePreference?.toFixed(1) ?? "–"}
              </p>
              <p className="text-muted-foreground text-xs">Ø-Prio</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
