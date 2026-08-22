import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { RichTextEditor } from "@modulocate/ui/components/rich-text-editor";
import { useTRPC } from "../trpc";

type RuleSummary = { id: string; name: string };

type FormState = {
  name: string;
  description: string;
};

const emptyForm: FormState = { name: "", description: "" };

function formStateFor(rule: { name: string; description: string | null } | undefined): FormState {
  if (!rule) return emptyForm;
  return {
    name: rule.name,
    description: rule.description ?? "",
  };
}

// The "standard" menu teachers reach by clicking a rule tile — content only
// (name/description). Everything else (moduleCount, priority, blocking,
// sub-rules) lives in RuleDialog, reached via the tile's gear icon.
export function RuleContentDialog({
  projectId,
  rule,
  open,
  onOpenChange,
}: {
  projectId: string;
  rule: RuleSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | undefined>();

  const { data: fullRule } = useQuery({
    ...trpc.rules.get.queryOptions({ projectId, id: rule.id }),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setForm(formStateFor(fullRule));
      setError(undefined);
    }
  }, [open, fullRule]);

  const updateRule = useMutation(
    trpc.rules.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.rules.list.queryKey({ projectId }) });
        queryClient.invalidateQueries({ queryKey: trpc.rules.get.queryKey({ projectId, id: rule.id }) });
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (!form.name.trim()) return setError("Name wird benötigt.");

    updateRule.mutate({
      id: rule.id,
      projectId,
      name: form.name.trim(),
      description: form.description.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regel bearbeiten</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-content-name">Name</Label>
            <Input
              id="rule-content-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-content-description">Beschreibung</Label>
            <RichTextEditor
              id="rule-content-description"
              value={form.description}
              onChange={(description) => setForm({ ...form, description })}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={updateRule.isPending}>
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
