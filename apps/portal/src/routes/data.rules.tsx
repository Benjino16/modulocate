import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import { pruneEmpty } from "@modulocate/ui/lib/use-list-filter";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";
import { useDialogSearchParam } from "../lib/use-dialog-search-param";
import { RuleDialog } from "../components/RuleDialog";
import { RuleContentDialog } from "../components/RuleContentDialog";

// ruleId/ruleSettingsId double as the open-state for RuleContentDialog and
// RuleDialog — see use-dialog-search-param.ts. ruleSettingsId uses the
// sentinel "new" for the create-rule flow.
type RulesSearch = { ruleId?: string; ruleSettingsId?: string };

export const Route = createFileRoute("/data/rules")({
  component: RulesPage,
  validateSearch: (search: Record<string, unknown>): RulesSearch =>
    pruneEmpty({
      ruleId: typeof search.ruleId === "string" ? search.ruleId : "",
      ruleSettingsId: typeof search.ruleSettingsId === "string" ? search.ruleSettingsId : "",
    }),
});

type Rule = { id: string; name: string };

function RulesPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const navigate = Route.useNavigate();
  const { ruleId, ruleSettingsId } = Route.useSearch();
  const { data: rules, isLoading } = useQuery({
    ...trpc.rules.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  function setRuleId(id: string | undefined, { push }: { push: boolean }) {
    navigate({ search: (prev) => pruneEmpty({ ...prev, ruleId: id }), replace: !push });
  }

  function setRuleSettingsId(id: string | undefined, { push }: { push: boolean }) {
    navigate({ search: (prev) => pruneEmpty({ ...prev, ruleSettingsId: id }), replace: !push });
  }

  const contentDialog = useDialogSearchParam(ruleId, setRuleId);
  const settingsDialog = useDialogSearchParam(ruleSettingsId, setRuleSettingsId);
  const contentRule = rules?.find((r) => r.id === ruleId);
  const settingsRule =
    ruleSettingsId && ruleSettingsId !== "new" ? rules?.find((r) => r.id === ruleSettingsId) : undefined;

  useEffect(() => {
    if (!rules) return;
    if (ruleId && !rules.some((r) => r.id === ruleId)) setRuleId(undefined, { push: false });
    if (ruleSettingsId && ruleSettingsId !== "new" && !rules.some((r) => r.id === ruleSettingsId)) {
      setRuleSettingsId(undefined, { push: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, ruleId, ruleSettingsId]);

  function openCreate() {
    settingsDialog.open("new");
  }

  function openSettings(rule: Rule) {
    settingsDialog.open(rule.id);
  }

  function openContent(rule: Rule) {
    contentDialog.open(rule.id);
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
          open={settingsDialog.isOpen}
          onOpenChange={settingsDialog.onOpenChange}
        />
      )}

      {projectId && contentRule && (
        <RuleContentDialog
          projectId={projectId}
          rule={contentRule}
          open={contentDialog.isOpen}
          onOpenChange={contentDialog.onOpenChange}
        />
      )}
    </div>
  );
}
