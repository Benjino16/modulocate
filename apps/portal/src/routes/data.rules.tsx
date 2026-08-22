import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";
import { RuleDialog } from "../components/RuleDialog";
import { RuleContentDialog } from "../components/RuleContentDialog";

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

  const [settingsRule, setSettingsRule] = useState<Rule | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contentRule, setContentRule] = useState<Rule | undefined>();
  const [contentOpen, setContentOpen] = useState(false);

  function openCreate() {
    setSettingsRule(undefined);
    setSettingsOpen(true);
  }

  function openSettings(rule: Rule) {
    setSettingsRule(rule);
    setSettingsOpen(true);
  }

  function openContent(rule: Rule) {
    setContentRule(rule);
    setContentOpen(true);
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
            // Not a <button> — it contains the nested settings <button>, and
            // buttons can't nest. role="button" + keyboard handling keeps it
            // accessible; group-hover reveals the gear icon.
            <div
              key={rule.id}
              role="button"
              tabIndex={0}
              onClick={() => openContent(rule)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openContent(rule);
                }
              }}
              className="group relative flex cursor-pointer flex-col gap-1 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openSettings(rule);
                }}
                aria-label="Regeleinstellungen"
                className="absolute top-2 right-2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <Settings className="size-4" />
              </button>

              <h3 className="pr-8 font-semibold">{rule.name}</h3>
            </div>
          ))}
        </div>
      )}

      {projectId && (
        <RuleDialog
          projectId={projectId}
          rule={settingsRule}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}

      {projectId && contentRule && (
        <RuleContentDialog
          projectId={projectId}
          rule={contentRule}
          open={contentOpen}
          onOpenChange={setContentOpen}
        />
      )}
    </div>
  );
}
