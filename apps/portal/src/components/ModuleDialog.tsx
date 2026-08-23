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
import { MultiSelect } from "@modulocate/ui/components/multi-select";
import { useTRPC } from "../trpc";

type Module = {
  id: string;
  name: string;
  description: string | null;
  teacher: string | null;
  scheduleLabel: string | null;
  displayScheduleLabel: string | null;
  min: number;
  max: number;
  categoryIds: string[];
  dateIds: string[];
};

type FormState = {
  name: string;
  teacher: string;
  scheduleLabel: string;
  min: string;
  max: string;
  categoryIds: string[];
  dateIds: string[];
};

const emptyForm: FormState = {
  name: "",
  teacher: "",
  scheduleLabel: "",
  min: "",
  max: "",
  categoryIds: [],
  dateIds: [],
};

function formStateFor(module: Module | undefined): FormState {
  if (!module) return emptyForm;
  return {
    name: module.name,
    teacher: module.teacher ?? "",
    scheduleLabel: module.scheduleLabel ?? "",
    min: String(module.min),
    max: String(module.max),
    categoryIds: module.categoryIds,
    dateIds: module.dateIds,
  };
}

export function ModuleDialog({
  projectId,
  module,
  open,
  onOpenChange,
  onDuplicated,
}: {
  projectId: string;
  module?: Module;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDuplicated?: (module: Module) => void;
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

  const { data: dates } = useQuery({
    ...trpc.dates.list.queryOptions({ projectId }),
    enabled: open,
  });
  const dateOptions = dates?.map((date) => ({ value: date.id, label: date.name })) ?? [];

  // Preview of what scheduleLabel falls back to when left empty — the
  // selected dates' names, comma-separated — so the placeholder shows
  // exactly what will be displayed instead of this field.
  const selectedDateLabels = form.dateIds
    .map((id) => dateOptions.find((option) => option.value === id)?.label)
    .filter((label): label is string => !!label);
  const scheduleLabelPlaceholder =
    selectedDateLabels.length > 0 ? selectedDateLabels.join(", ") : "z. B. Jeden Montag, Q2 - Mi, Block";

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

  // Bare mutations for the duplicate flow, deliberately without onSuccess —
  // duplicating saves the current module, creates a copy, then swaps this
  // same dialog over to the copy (handleDuplicate below), it never closes it
  // the way a normal save/create does.
  const duplicateSave = useMutation(trpc.modules.update.mutationOptions());
  const duplicateCreate = useMutation(trpc.modules.create.mutationOptions());

  const isPending =
    createModule.isPending ||
    updateModule.isPending ||
    removeModule.isPending ||
    duplicateSave.isPending ||
    duplicateCreate.isPending;

  function validateForm() {
    setError(undefined);
    const min = Number(form.min);
    const max = Number(form.max);
    if (!form.name.trim()) {
      setError("Name wird benötigt.");
      return null;
    }
    if (!Number.isInteger(min) || min < 0) {
      setError("Min. Teilnehmer muss eine positive Zahl sein.");
      return null;
    }
    if (!Number.isInteger(max) || max < 0) {
      setError("Max. Teilnehmer muss eine positive Zahl sein.");
      return null;
    }
    if (max < min) {
      setError("Max. Teilnehmer muss größer oder gleich Min. sein.");
      return null;
    }
    return { min, max, teacher: form.teacher.trim(), scheduleLabel: form.scheduleLabel.trim() };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validated = validateForm();
    if (!validated) return;
    const { min, max, teacher, scheduleLabel } = validated;

    if (module) {
      // Explicit null (not undefined) to clear — tRPC's JSON transport drops
      // undefined keys entirely, so omitting the field would leave the old
      // value untouched instead of clearing it.
      updateModule.mutate({
        id: module.id,
        projectId,
        name: form.name.trim(),
        teacher: teacher || null,
        scheduleLabel: scheduleLabel || null,
        min,
        max,
        categoryIds: form.categoryIds,
        dateIds: form.dateIds,
      });
    } else {
      createModule.mutate({
        projectId,
        name: form.name.trim(),
        teacher: teacher || undefined,
        scheduleLabel: scheduleLabel || undefined,
        min,
        max,
        categoryIds: form.categoryIds,
        dateIds: form.dateIds,
      });
    }
  }

  async function handleDuplicate() {
    if (!module) return;
    const validated = validateForm();
    if (!validated) return;
    const { min, max, teacher, scheduleLabel } = validated;

    try {
      // Save the currently open module first, then copy its (now current)
      // data into a new module — description included, even though this
      // dialog doesn't edit it itself (that's ModuleContentDialog's job).
      const saved = await duplicateSave.mutateAsync({
        id: module.id,
        projectId,
        name: form.name.trim(),
        teacher: teacher || null,
        scheduleLabel: scheduleLabel || null,
        min,
        max,
        categoryIds: form.categoryIds,
        dateIds: form.dateIds,
      });

      const created = await duplicateCreate.mutateAsync({
        projectId,
        name: saved.name,
        description: saved.description ?? undefined,
        teacher: saved.teacher ?? undefined,
        scheduleLabel: saved.scheduleLabel ?? undefined,
        min: saved.min,
        max: saved.max,
        categoryIds: saved.categoryIds,
        dateIds: saved.dateIds,
      });

      invalidateList();
      onDuplicated?.(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Duplizieren.");
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
          <DialogTitle>{module ? "Moduleinstellungen" : "Neues Modul"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!module && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="module-name">Name</Label>
              <Input
                id="module-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
          )}

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
              placeholder={scheduleLabelPlaceholder}
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="module-dates">Termine</Label>
            <MultiSelect
              id="module-dates"
              options={dateOptions}
              selected={form.dateIds}
              onChange={(dateIds) => setForm({ ...form, dateIds })}
              placeholder="Keine Termine"
              emptyText="Keine Termine vorhanden."
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
            <div className="flex gap-2">
              {module && (
                <Button type="button" variant="secondary" onClick={handleDuplicate} disabled={isPending}>
                  Duplizieren
                </Button>
              )}
              <Button type="submit" disabled={isPending}>
                {module ? "Speichern" : "Modul anlegen"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
