import { cn } from "@modulocate/ui/lib/utils";

export function CapacityBar({
  studentCount,
  min,
  max,
}: {
  studentCount: number;
  min: number;
  max: number;
}) {
  const belowMin = studentCount < min;
  const percent = max > 0 ? Math.min(100, (studentCount / max) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", belowMin ? "bg-amber-500" : "bg-foreground")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-sm text-muted-foreground whitespace-nowrap">
        {studentCount}/{max}
      </span>
    </div>
  );
}
