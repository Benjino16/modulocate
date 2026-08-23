import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@modulocate/ui/lib/utils";

export function SortableModuleRow({
  module,
  rank,
  isPredicted,
  isGap,
  onOpenInfo,
}: {
  module: {
    id: string;
    name: string;
    teacher: string | null;
    displayScheduleLabel: string | null;
    categoryNames: string[];
  };
  rank: number;
  // Predicted result of the local, competition-free allocation-engine
  // preview (see simulateAllocation.ts) — purely informational highlighting,
  // not a guarantee.
  isPredicted: boolean;
  // This module is sandwiched between two predicted modules in the current
  // ranking without being predicted itself (see vote.tsx's gapModuleIds) —
  // flagged so the student notices it's blocking an otherwise-contiguous
  // run of grantable choices.
  isGap: boolean;
  onOpenInfo: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: module.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const meta = [module.displayScheduleLabel, module.categoryNames.join(", ") || null, module.teacher]
    .filter(Boolean)
    .join(" • ");

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card p-3",
        isDragging && "relative z-10 shadow-lg",
        isPredicted && "border-primary/50 bg-primary/5",
        isGap && "border-dashed border-destructive/70 bg-destructive/5",
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium",
          isPredicted && "bg-primary text-primary-foreground",
        )}
      >
        {rank}
      </span>
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={onOpenInfo}
        aria-label={`Details zu ${module.name} anzeigen`}
      >
        <p className="truncate font-medium">{module.name}</p>
        {meta && <p className="truncate text-sm text-muted-foreground">{meta}</p>}
      </button>
      <button
        type="button"
        className="flex size-9 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        aria-label="Modul verschieben"
        {...attributes}
        {...listeners}
      >
        <GripVertical />
      </button>
    </li>
  );
}
