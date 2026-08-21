import { useMemo } from "react"

// Drops empty/default values (falsy string, empty array, undefined) from a
// search-params-shaped object, so callers can write it straight into a
// route's URL search state without leaving a trail of "?q=&category=" noise
// when nothing is actually active.
export function pruneEmpty<T extends Record<string, unknown>>(params: T): Partial<T> {
  const result: Partial<T> = {}
  for (const key in params) {
    const value = params[key]
    const isEmpty = value === "" || value === undefined || (Array.isArray(value) && value.length === 0)
    if (!isEmpty) result[key] = value
  }
  return result
}

export type FilterOption = { value: string; label: string }
export type ActiveFilters = Record<string, string[]>
export type FilterConfig<T> = {
  key: string
  label: string
  options: FilterOption[]
  match: (item: T, selected: string[]) => boolean
}

// Pure derivation over externally-owned state (URL search params, local
// state, whatever the page prefers) — lets query/filters live wherever is
// convenient for the caller instead of being tied to one storage strategy.
export function useListFilter<T>({
  items,
  query,
  searchText,
  filters = [],
  activeFilters,
}: {
  items: T[]
  query: string
  searchText: (item: T) => string
  filters?: FilterConfig<T>[]
  activeFilters: ActiveFilters
}): T[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (q && !searchText(item).toLowerCase().includes(q)) return false
      for (const filter of filters) {
        const selected = activeFilters[filter.key]
        if (selected?.length && !filter.match(item, selected)) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, activeFilters, filters])
}
