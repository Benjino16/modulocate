import { Search, X } from "lucide-react"
import { Button } from "@modulocate/ui/components/button"
import { Input } from "@modulocate/ui/components/input"
import { MultiSelect } from "@modulocate/ui/components/multi-select"
import type { ActiveFilters, FilterConfig } from "@modulocate/ui/lib/use-list-filter"

// Generic search + tag-filter control row. Knows nothing about how the
// filtered items get rendered (grid of tiles vs. table) — pages own that,
// this only owns the query/filter inputs so it drops into either layout.
function SearchFilterBar<T>({
  query,
  onQueryChange,
  searchPlaceholder = "Suchen…",
  filters = [],
  activeFilters,
  onFilterChange,
}: {
  query: string
  onQueryChange: (value: string) => void
  searchPlaceholder?: string
  filters?: FilterConfig<T>[]
  activeFilters: ActiveFilters
  onFilterChange: (key: string, values: string[]) => void
}) {
  const hasActiveFilters =
    query.trim() !== "" || filters.some((filter) => (activeFilters[filter.key]?.length ?? 0) > 0)

  function reset() {
    onQueryChange("")
    for (const filter of filters) onFilterChange(filter.key, [])
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-8"
        />
      </div>
      {filters.map((filter) => (
        <MultiSelect
          key={filter.key}
          options={filter.options}
          selected={activeFilters[filter.key] ?? []}
          onChange={(values) => onFilterChange(filter.key, values)}
          placeholder={filter.label}
          className="w-auto min-w-40"
        />
      ))}
      {hasActiveFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={reset}>
          <X /> Filter zurücksetzen
        </Button>
      )}
    </div>
  )
}

export { SearchFilterBar }
