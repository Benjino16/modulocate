import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@modulocate/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@modulocate/ui/components/dialog";
import { useTRPC } from "../trpc";

type StudentSummary = {
  id: string;
  name: string;
  email: string;
  email2: string | null;
  groupName: string | null;
  ruleName: string | null;
  signInCode: string | null;
};

export function RegenerateCodeDialog({
  projectId,
  student,
  open,
  onOpenChange,
}: {
  projectId: string;
  student: StudentSummary | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | undefined>();

  const regenerateSignInCode = useMutation(
    trpc.students.regenerateSignInCode.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.students.list.queryKey({ projectId }) });
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    }),
  );

  function handleOpenChange(next: boolean) {
    if (next) setError(undefined);
    onOpenChange(next);
  }

  function handleConfirm() {
    if (!student) return;
    setError(undefined);
    regenerateSignInCode.mutate({ projectId, id: student.id });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuen Voting-Code erzeugen</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">{student?.name}</p>
          <p className="text-muted-foreground">
            {student?.groupName || "Keine Klasse"} · {student?.ruleName || "Keine Regel zugewiesen"}
          </p>
          <p className="text-muted-foreground">{student?.email}</p>
          {student?.email2 && <p className="text-muted-foreground">{student.email2}</p>}
        </div>

        <p className="text-sm">
          {student?.signInCode
            ? "Der bisherige Voting-Code wird ungültig – ein bereits verschickter Link funktioniert danach nicht mehr."
            : "Für diesen Schüler wird ein neuer Voting-Code erzeugt."}
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={regenerateSignInCode.isPending}
          >
            Abbrechen
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={regenerateSignInCode.isPending}>
            Bestätigen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
