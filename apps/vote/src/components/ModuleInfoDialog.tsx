import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@modulocate/ui/components/dialog";

// Placeholder content only — this will become the shared module-detail view
// used by both the vote and portal apps once that's designed.
export function ModuleInfoDialog({
  module,
  onOpenChange,
}: {
  module: { name: string; teacher: string | null; scheduleLabel: string | null } | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={module !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{module?.name}</DialogTitle>
          <DialogDescription>
            {module?.scheduleLabel}
            {module?.scheduleLabel && module?.teacher && " · "}
            {module?.teacher}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Weitere Modulinformationen folgen hier bald.</p>
      </DialogContent>
    </Dialog>
  );
}
