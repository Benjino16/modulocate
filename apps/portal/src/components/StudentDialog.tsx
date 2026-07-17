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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@modulocate/ui/components/select";
import { useTRPC } from "../trpc";

type Student = {
  id: string;
  name: string;
  email: string;
  email2: string | null;
  groupId: string | null;
};

const NO_GROUP = "none";

type FormState = { name: string; email: string; email2: string; groupId: string };

function formStateFor(student: Student | undefined): FormState {
  if (!student) return { name: "", email: "", email2: "", groupId: NO_GROUP };
  return {
    name: student.name,
    email: student.email,
    email2: student.email2 ?? "",
    groupId: student.groupId ?? NO_GROUP,
  };
}

export function StudentDialog({
  projectId,
  student,
  open,
  onOpenChange,
}: {
  projectId: string;
  student?: Student;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => formStateFor(student));
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setForm(formStateFor(student));
      setError(undefined);
    }
  }, [open, student]);

  const { data: groups } = useQuery({
    ...trpc.studentGroups.list.queryOptions({ projectId }),
    enabled: open,
  });

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: trpc.students.list.queryKey({ projectId }) });

  const createStudent = useMutation(
    trpc.students.create.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const updateStudent = useMutation(
    trpc.students.update.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const removeStudent = useMutation(
    trpc.students.remove.mutationOptions({
      onSuccess: () => {
        invalidateList();
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const isPending = createStudent.isPending || updateStudent.isPending || removeStudent.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (!form.name.trim()) return setError("Name wird benötigt.");
    if (!form.email.trim()) return setError("E-Mail wird benötigt.");

    const payload = {
      projectId,
      name: form.name.trim(),
      email: form.email.trim(),
      email2: form.email2.trim() || undefined,
      groupId: form.groupId === NO_GROUP ? null : form.groupId,
    };

    if (student) {
      updateStudent.mutate({ id: student.id, ...payload });
    } else {
      createStudent.mutate(payload);
    }
  }

  function handleDelete() {
    if (!student) return;
    if (!window.confirm(`Schüler "${student.name}" wirklich löschen?`)) return;
    removeStudent.mutate({ id: student.id, projectId });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{student ? "Schüler bearbeiten" : "Neuer Schüler"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="student-name">Name</Label>
            <Input
              id="student-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="student-email">E-Mail</Label>
            <Input
              id="student-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="student-email2">E-Mail (2, optional)</Label>
            <Input
              id="student-email2"
              type="email"
              value={form.email2}
              onChange={(e) => setForm({ ...form, email2: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="student-group">Klasse</Label>
            <Select value={form.groupId} onValueChange={(groupId) => setForm({ ...form, groupId })}>
              <SelectTrigger id="student-group">
                <SelectValue placeholder="Keine Klasse" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GROUP}>Keine Klasse</SelectItem>
                {groups?.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="items-center sm:justify-between">
            {student ? (
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
              {student ? "Speichern" : "Schüler anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
