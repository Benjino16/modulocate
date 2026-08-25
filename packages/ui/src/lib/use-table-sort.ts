import { useMemo } from "react"

export type SortDirection = "asc" | "desc"
export type SortState = { key: string; dir: SortDirection } | null
type SortValue = string | number | Date | null | undefined

function compare(a: SortValue, b: SortValue): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as string | number | Date).getTime() - new Date(b as string | number | Date).getTime()
  }
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b), "de", { sensitivity: "base" })
}

// Pure derivation over externally-owned state (URL search params, local
// state, whatever the page prefers) — mirrors useListFilter so sort and
// filter compose as two independent passes over the same list.
export function useTableSort<T>({
  items,
  sort,
  sortValue,
}: {
  items: T[]
  sort: SortState
  sortValue: (item: T, key: string) => SortValue
}): T[] {
  return useMemo(() => {
    if (!sort) return items
    const sorted = [...items].sort((a, b) => compare(sortValue(a, sort.key), sortValue(b, sort.key)))
    return sort.dir === "asc" ? sorted : sorted.reverse()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sort, sortValue])
}

// Click an unsorted/other column -> ascending. Click the active column again -> flip direction.
export function toggleSort(current: SortState, key: string): SortState {
  if (!current || current.key !== key) return { key, dir: "asc" }
  return { key, dir: current.dir === "asc" ? "desc" : "asc" }
}
