import { CircleCheck, CircleX } from "lucide-react";
import { Button } from "@modulocate/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@modulocate/ui/components/dialog";

export type SubmitResult =
  | { status: "success" }
  | { status: "error"; message: string; requiresLogin: boolean };

export function SubmitResultDialog({
  result,
  onOpenChange,
  onLoginClick,
}: {
  result: SubmitResult | null;
  onOpenChange: (open: boolean) => void;
  onLoginClick: () => void;
}) {
  const isSuccess = result?.status === "success";

  return (
    <Dialog open={result !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          {isSuccess ? (
            <CircleCheck className="size-12 text-success" />
          ) : (
            <CircleX className="size-12 text-destructive" />
          )}
          <DialogTitle>{isSuccess ? "Wahl eingereicht" : "Wahl konnte nicht eingereicht werden"}</DialogTitle>
          <DialogDescription>
            {isSuccess ? (
              <>
                Deine Wahl wurde erfolgreich eingereicht.
                <br />
                Möchtest du deine Präferenzen anpassen, verschiebe einfach deine Module und klicke auf „Wahl
                aktualisieren“.
              </>
            ) : (
              result?.status === "error" && result.message
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          {result?.status === "error" && result.requiresLogin ? (
            <Button onClick={onLoginClick}>Erneut anmelden</Button>
          ) : (
            <Button onClick={() => onOpenChange(false)}>{isSuccess ? "Weiter" : "Schließen"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
