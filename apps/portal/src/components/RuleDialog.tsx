import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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
import { Checkbox } from "@modulocate/ui/components/checkbox";
import { MultiSelect } from "@modulocate/ui/components/multi-select";
import { useTRPC } from "../trpc";

type RuleSummary = { id: string; name: string };

type SubRuleForm = {
  // client-only key, stable across re-renders; sub-rule ids only exist once saved
  key: string;
  categoryIds: string[];
};

type FormState = {
  name: string;
  moduleCount: string;
  priority: boolean;
  blockedCategoryIds: string[];
  subRules: SubRuleForm[];
};

const emptyForm: FormState = {
  name: "",
  moduleCount: "",
  priority: false,
  blockedCategoryIds: [],
  subRules: [],
};

let subRuleKeySeq = 0;
function nextSubRuleKey() {
  subRuleKeySeq += 1;
  return `new-${subRuleKeySeq}`;
}

function formStateFor(
  rule: { name: string; moduleCount: number; priority: boolean; blockedCategoryIds: string[]; subRules: { id: string; categoryIds: string[] }[] } | undefined,
): FormState {
  if (!rule) return emptyForm;
  return {
    name: rule.name,
    moduleCount: String(rule.moduleCount),
    priority: rule.priority,
    blockedCategoryIds: rule.blockedCategoryIds,
    subRules: rule.subRules.map((subRule) => ({ key: subRule.id, categoryIds: subRule.categoryIds })),
  };
}

export function RuleDialog({
  projectId,
  rule,
  open,
  onOpenChange,
}: {
  projectId: string;
  rule?: RuleSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | undefined>();

  const { data: fullRule } = useQuery({
    ...trpc.rules.get.queryOptions({ projectId, id: rule?.id ?? "" }),
    enabled: open && !!rule,
  });

  const { data: categories } = useQuery({
    ...trpc.moduleCategories.list.queryOptions({ projectId }),
    enabled: open,
  });
  const categoryOptions = categories?.map((category) => ({ value: category.id, label: category.name })) ?? [];

  useEffect(() => {
    if (open) {
      setForm(formStateFor(rule ? fullRule : undefined));
      setError(undefined);
    }
  }, [open, rule, fullRule]);

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: trpc.rules.list.queryKey({ projectId }) });
    if (rule) {
      queryClient.invalidateQueries({ queryKey: trpc.rules.get.queryKey({ projectId, id: rule.id }) });
    }
  };

  const createRule = useMutation(
    trpc.rules.create.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const updateRule = useMutation(
    trpc.rules.update.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const removeRule = useMutation(
    trpc.rules.remove.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const isPending = createRule.isPending || updateRule.isPending || removeRule.isPending;

  function setBlockedCategoryIds(categoryIds: string[]) {
    setForm((prev) => ({ ...prev, blockedCategoryIds: categoryIds }));
  }

  function setSubRuleCategoryIds(subRuleKey: string, categoryIds: string[]) {
    setForm((prev) => ({
      ...prev,
      subRules: prev.subRules.map((subRule) => (subRule.key !== subRuleKey ? subRule : { ...subRule, categoryIds })),
    }));
  }

  function addSubRule() {
    setForm((prev) => ({ ...prev, subRules: [...prev.subRules, { key: nextSubRuleKey(), categoryIds: [] }] }));
  }

  function removeSubRule(subRuleKey: string) {
    setForm((prev) => ({ ...prev, subRules: prev.subRules.filter((subRule) => subRule.key !== subRuleKey) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (!form.name.trim()) return setError("Name wird benötigt.");

    const moduleCount = Number(form.moduleCount);
    if (!Number.isInteger(moduleCount) || moduleCount < 1) {
      return setError("Anzahl Module muss eine positive ganze Zahl sein.");
    }
    if (form.subRules.some((subRule) => subRule.categoryIds.length === 0)) {
      return setError("Jede Sub-Regel benötigt mindestens eine Kategorie.");
    }

    const payload = {
      projectId,
      name: form.name.trim(),
      moduleCount,
      priority: form.priority,
      blockedCategoryIds: form.blockedCategoryIds,
      subRules: form.subRules.map((subRule) => ({ categoryIds: subRule.categoryIds })),
    };

    if (rule) {
      updateRule.mutate({ id: rule.id, ...payload });
    } else {
      createRule.mutate(payload);
    }
  }

  function handleDelete() {
    if (!rule) return;
    if (!window.confirm(`Regel "${rule.name}" wirklich löschen?`)) return;
    removeRule.mutate({ id: rule.id, projectId });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? "Regel bearbeiten" : "Neue Regel"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-module-count">Anzahl Module</Label>
              <Input
                id="rule-module-count"
                type="number"
                min={1}
                value={form.moduleCount}
                onChange={(e) => setForm({ ...form, moduleCount: e.target.value })}
                required
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="rule-priority"
                checked={form.priority}
                onCheckedChange={(checked) => setForm({ ...form, priority: checked === true })}
              />
              <Label htmlFor="rule-priority" className="cursor-pointer font-normal">
                Priorität bei der Zuteilung
              </Label>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-blocked-categories">Blockierte Kategorien</Label>
            <MultiSelect
              id="rule-blocked-categories"
              options={categoryOptions}
              selected={form.blockedCategoryIds}
              onChange={setBlockedCategoryIds}
              placeholder="Keine blockierten Kategorien"
              emptyText="Keine Kategorien vorhanden."
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Sub-Regeln</Label>
              <Button type="button" size="sm" variant="outline" onClick={addSubRule}>
                <Plus /> Sub-Regel
              </Button>
            </div>

            {!form.subRules.length && (
              <p className="text-sm text-muted-foreground">Noch keine Sub-Regeln angelegt.</p>
            )}

            {form.subRules.map((subRule, i) => (
              <div key={subRule.key} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Sub-Regel {i + 1}</span>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => removeSubRule(subRule.key)}
                    aria-label="Sub-Regel entfernen"
                  >
                    <Trash2 />
                  </Button>
                </div>
                <MultiSelect
                  options={categoryOptions}
                  selected={subRule.categoryIds}
                  onChange={(categoryIds) => setSubRuleCategoryIds(subRule.key, categoryIds)}
                  placeholder="Kategorien wählen"
                  emptyText="Keine Kategorien vorhanden."
                />
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="items-center sm:justify-between">
            {rule ? (
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
              {rule ? "Speichern" : "Regel anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
