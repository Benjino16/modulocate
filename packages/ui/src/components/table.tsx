import * as React from "react"
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react"

import { cn } from "@modulocate/ui/lib/utils"
import type { SortState } from "@modulocate/ui/lib/use-table-sort"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium text-muted-foreground whitespace-nowrap",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("p-2 align-middle whitespace-nowrap", className)}
      {...props}
    />
  )
}

// Clickable TableHead that toggles sort on click and shows the current
// direction. Knows nothing about how the sort state is stored (URL search
// params vs. useState) — pass the current SortState and a click handler.
function SortableTableHead({
  sortKey,
  currentSort,
  onSort,
  className,
  children,
  ...props
}: {
  sortKey: string
  currentSort: SortState
  onSort: (key: string) => void
} & Omit<React.ComponentProps<"th">, "onClick">) {
  const active = currentSort?.key === sortKey
  const Icon = active ? (currentSort!.dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown

  return (
    <TableHead
      className={cn("cursor-pointer select-none hover:text-foreground", className)}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (currentSort!.dir === "asc" ? "ascending" : "descending") : "none"}
      {...props}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <Icon className={cn("size-3.5", !active && "text-muted-foreground/50")} />
      </span>
    </TableHead>
  )
}

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell, SortableTableHead }
