import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@modulocate/ui/lib/utils";

export function SortableModuleRow({
  module,
  rank,
  onOpenInfo,
}: {
  module: { id: string; name: string; teacher: string | null; scheduleLabel: string | null };
  rank: number;
  onOpenInfo: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: module.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card p-3",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
        {rank}
      </span>
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={onOpenInfo}
        aria-label={`Details zu ${module.name} anzeigen`}
      >
        <p className="truncate font-medium">{module.name}</p>
        {(module.scheduleLabel || module.teacher) && (
          <p className="truncate text-sm text-muted-foreground">
            {module.scheduleLabel}
            {module.scheduleLabel && module.teacher && " · "}
            {module.teacher}
          </p>
        )}
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
