import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";
import { RuleDialog } from "../components/RuleDialog";

export const Route = createFileRoute("/data/rules")({
  component: RulesPage,
});

type Rule = { id: string; name: string };

function RulesPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const { data: rules, isLoading } = useQuery({
    ...trpc.rules.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const [editingRule, setEditingRule] = useState<Rule | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  function openCreate() {
    setEditingRule(undefined);
    setDialogOpen(true);
  }

  function openEdit(rule: Rule) {
    setEditingRule(rule);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Regeln</h2>
        <Button size="sm" onClick={openCreate} disabled={!projectId}>
          <Plus /> Neue Regel
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Lade Regeln…</p>}
      {!isLoading && !rules?.length && (
        <p className="text-muted-foreground">Noch keine Regeln angelegt.</p>
      )}

      {!!rules?.length && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {rules.map((rule) => (
            <button
              key={rule.id}
              type="button"
              onClick={() => openEdit(rule)}
              className="rounded-lg border p-4 text-left font-semibold transition-colors hover:bg-accent"
            >
              {rule.name}
            </button>
          ))}
        </div>
      )}

      {projectId && (
        <RuleDialog
          projectId={projectId}
          rule={editingRule}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}
