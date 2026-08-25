import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@modulocate/ui/components/table";
import { SearchFilterBar } from "@modulocate/ui/components/search-filter-bar";
import { useListFilter, pruneEmpty } from "@modulocate/ui/lib/use-list-filter";
import { cn } from "@modulocate/ui/lib/utils";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";

type AuditSearch = { q?: string };

export const Route = createFileRoute("/audit/")({
  component: AuditEmailsPage,
  validateSearch: (search: Record<string, unknown>): AuditSearch =>
    pruneEmpty({ q: typeof search.q === "string" ? search.q : "" }),
});

const TYPE_LABEL: Record<string, string> = {
  "voting-invite": "Wahl-Einladung",
  "voting-results": "Ergebnis-Mitteilung",
  "password-reset": "Passwort-Reset",
};

const STATUS_LABEL: Record<string, string> = {
  sent: "Versendet",
  failed: "Fehlgeschlagen",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AuditEmailsPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const navigate = Route.useNavigate();
  const { q = "" } = Route.useSearch();
  const { data: entries, isLoading } = useQuery({
    ...trpc.emailLog.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const filteredEntries = useListFilter({
    items: entries ?? [],
    query: q,
    searchText: (entry) =>
      `${entry.studentName ?? ""} ${entry.recipient} ${TYPE_LABEL[entry.type] ?? entry.type} ${STATUS_LABEL[entry.status] ?? entry.status}`,
    activeFilters: {},
  });

  function setQuery(value: string) {
    navigate({ search: () => pruneEmpty({ q: value }), replace: true });
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">E-Mails</h2>

      {!isLoading && !!entries?.length && (
        <SearchFilterBar
          query={q}
          onQueryChange={setQuery}
          searchPlaceholder="E-Mails durchsuchen…"
          activeFilters={{}}
          onFilterChange={() => {}}
        />
      )}

      {isLoading && <p className="text-muted-foreground">Lade E-Mail-Verlauf…</p>}
      {!isLoading && !entries?.length && (
        <p className="text-muted-foreground">Noch keine E-Mails versendet.</p>
      )}
      {!isLoading && !!entries?.length && !filteredEntries.length && (
        <p className="text-muted-foreground">Keine E-Mails entsprechen der Suche.</p>
      )}

      {!!filteredEntries.length && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zeitpunkt</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Schüler</TableHead>
              <TableHead>Empfänger</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries.map((entry) => (
              <TableRow
                key={entry.id}
                className={cn(entry.status === "failed" && "bg-red-500/10")}
              >
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateTime(entry.sentAt)}
                </TableCell>
                <TableCell>{TYPE_LABEL[entry.type] ?? entry.type}</TableCell>
                <TableCell className="text-muted-foreground">{entry.studentName ?? "–"}</TableCell>
                <TableCell className="text-muted-foreground">{entry.recipient}</TableCell>
                <TableCell>
                  {STATUS_LABEL[entry.status] ?? entry.status}
                  {entry.status === "failed" && entry.error && (
                    <span className="ml-2 text-xs text-muted-foreground">{entry.error}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
