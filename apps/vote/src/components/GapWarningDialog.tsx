import { TriangleAlert } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@modulocate/ui/components/dialog";

// Shown when the student tries to submit while at least one module is
// flagged as a gap (vote.tsx's gapModuleIds — a non-grantable module wedged
// between two grantable ones). Purely a confirmation, not a hard block: the
// ranking is still just a wish, so submitting anyway must stay possible.
export function GapWarningDialog({
  open,
  moduleCount,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  moduleCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <TriangleAlert className="size-12 text-destructive" />
          <DialogTitle>Nicht alle Top-Module erreichbar</DialogTitle>
          <DialogDescription>
            Du hast aktuell Module in deinen Top-{moduleCount}-Prioritäten, die du nicht alle bekommen kannst.
            Möchtest du deine Wahl trotzdem einreichen?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button variant="outline" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Trotzdem einreichen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
