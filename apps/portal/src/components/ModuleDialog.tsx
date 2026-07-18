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
import { Textarea } from "@modulocate/ui/components/textarea";
import { MultiSelect } from "@modulocate/ui/components/multi-select";
import { useTRPC } from "../trpc";

type Module = {
  id: string;
  name: string;
  description: string | null;
  teacher: string | null;
  scheduleLabel: string | null;
  min: number;
  max: number;
  categoryIds: string[];
};

type FormState = {
  name: string;
  teacher: string;
  scheduleLabel: string;
  min: string;
  max: string;
  description: string;
  categoryIds: string[];
};

const emptyForm: FormState = {
  name: "",
  teacher: "",
  scheduleLabel: "",
  min: "",
  max: "",
  description: "",
  categoryIds: [],
};

function formStateFor(module: Module | undefined): FormState {
  if (!module) return emptyForm;
  return {
    name: module.name,
    teacher: module.teacher ?? "",
    scheduleLabel: module.scheduleLabel ?? "",
    min: String(module.min),
    max: String(module.max),
    description: module.description ?? "",
    categoryIds: module.categoryIds,
  };
}

export function ModuleDialog({
  projectId,
  module,
  open,
  onOpenChange,
}: {
  projectId: string;
  module?: Module;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => formStateFor(module));
  const [error, setError] = useState<string | undefined>();

  const { data: categories } = useQuery({
    ...trpc.moduleCategories.list.queryOptions({ projectId }),
    enabled: open,
  });
  const categoryOptions = categories?.map((category) => ({ value: category.id, label: category.name })) ?? [];

  useEffect(() => {
    if (open) {
      setForm(formStateFor(module));
      setError(undefined);
    }
  }, [open, module]);

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: trpc.modules.list.queryKey({ projectId }) });

  const createModule = useMutation(
    trpc.modules.create.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const updateModule = useMutation(
    trpc.modules.update.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const removeModule = useMutation(
    trpc.modules.remove.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const isPending = createModule.isPending || updateModule.isPending || removeModule.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    const min = Number(form.min);
    const max = Number(form.max);
    if (!form.name.trim()) return setError("Name wird benötigt.");
    if (!Number.isInteger(min) || min < 0) return setError("Min. Teilnehmer muss eine positive Zahl sein.");
    if (!Number.isInteger(max) || max < 0) return setError("Max. Teilnehmer muss eine positive Zahl sein.");
    if (max < min) return setError("Max. Teilnehmer muss größer oder gleich Min. sein.");

    const payload = {
      projectId,
      name: form.name.trim(),
      teacher: form.teacher.trim() || undefined,
      scheduleLabel: form.scheduleLabel.trim() || undefined,
      description: form.description.trim() || undefined,
      min,
      max,
      categoryIds: form.categoryIds,
    };

    if (module) {
      updateModule.mutate({ id: module.id, ...payload });
    } else {
      createModule.mutate(payload);
    }
  }

  function handleDelete() {
    if (!module) return;
    if (!window.confirm(`Modul "${module.name}" wirklich löschen?`)) return;
    removeModule.mutate({ id: module.id, projectId });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{module ? "Modul bearbeiten" : "Neues Modul"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="module-name">Name</Label>
            <Input
              id="module-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="module-teacher">Lehrer/-in</Label>
            <Input
              id="module-teacher"
              value={form.teacher}
              onChange={(e) => setForm({ ...form, teacher: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="module-schedule">Termin (Anzeige-Label)</Label>
            <Input
              id="module-schedule"
              placeholder="z. B. Jeden Montag, Q2 - Mi, Block"
              value={form.scheduleLabel}
              onChange={(e) => setForm({ ...form, scheduleLabel: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="module-min">Min. Teilnehmer</Label>
              <Input
                id="module-min"
                type="number"
                min={0}
                value={form.min}
                onChange={(e) => setForm({ ...form, min: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="module-max">Max. Teilnehmer</Label>
              <Input
                id="module-max"
                type="number"
                min={0}
                value={form.max}
                onChange={(e) => setForm({ ...form, max: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="module-description">Beschreibung</Label>
            <Textarea
              id="module-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="module-categories">Kategorien</Label>
            <MultiSelect
              id="module-categories"
              options={categoryOptions}
              selected={form.categoryIds}
              onChange={(categoryIds) => setForm({ ...form, categoryIds })}
              placeholder="Keine Kategorien"
              emptyText="Keine Kategorien vorhanden."
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="items-center sm:justify-between">
            {module ? (
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
              {module ? "Speichern" : "Modul anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
