import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";

export const Route = createFileRoute("/data/rules")({
  component: RulesPage,
});

function RulesPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const { data: rules, isLoading } = useQuery({
    ...trpc.rules.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  if (isLoading) return <p className="text-muted-foreground">Lade Regeln…</p>;
  if (!rules?.length) return <p className="text-muted-foreground">Noch keine Regeln angelegt.</p>;

  return (
    <ul className="divide-y rounded-lg border">
      {rules.map((rule) => (
        <li key={rule.id} className="flex items-center justify-between px-4 py-3">
          <span className="font-medium">{rule.name}</span>
          <span className="text-sm text-muted-foreground">{rule.subRules.length} Sub-Regel(n)</span>
        </li>
      ))}
    </ul>
  );
}
