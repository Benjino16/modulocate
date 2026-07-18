import { ChevronDownIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@modulocate/ui/components/dropdown-menu"
import { cn } from "@modulocate/ui/lib/utils"

export type MultiSelectOption = { value: string; label: string }

// Trigger shows the current selection as chips (quick "what's picked" preview);
// the dropdown, opened on click, holds the full option list as toggleable
// checkboxes. Selecting an item stays open (onSelect preventDefault) so users
// can check several options in one interaction instead of reopening each time.
function MultiSelect({
  id,
  options,
  selected,
  onChange,
  placeholder = "Auswählen",
  emptyText = "Keine Optionen vorhanden.",
  className,
}: {
  id?: string
  options: MultiSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  emptyText?: string
  className?: string
}) {
  const selectedOptions = options.filter((option) => selected.includes(option.value))

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          id={id}
          type="button"
          className={cn(
            "flex min-h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-1.5 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
            className,
          )}
        >
          {selectedOptions.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <span className="flex flex-1 flex-wrap gap-1 py-0.5 text-left">
              {selectedOptions.map((option) => (
                <span
                  key={option.value}
                  className="rounded-sm bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                >
                  {option.label}
                </span>
              ))}
            </span>
          )}
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 w-(--radix-dropdown-menu-trigger-width) min-w-(--radix-dropdown-menu-trigger-width)"
      >
        {options.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</p>}
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => toggle(option.value)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { MultiSelect }
