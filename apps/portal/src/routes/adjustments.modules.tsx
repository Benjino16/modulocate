import { useState } from "react";
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
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";
import { ModuleRosterDialog } from "../components/ModuleRosterDialog";
import { CapacityBar } from "../components/CapacityBar";

export const Route = createFileRoute("/adjustments/modules")({
  component: AdjustmentsModulesPage,
});

type Module = {
  id: string;
  name: string;
  teacher: string | null;
  displayScheduleLabel: string | null;
  min: number;
  max: number;
  studentCount: number;
  medianPreference: number | null;
};

function AdjustmentsModulesPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const { data: modules, isLoading } = useQuery({
    ...trpc.modules.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  // Fullest first: 22/15 -> 15/15 -> 7/9 -> 0/3
  const sortedModules = [...(modules ?? [])].sort(
    (a, b) => fillRatio(b) - fillRatio(a),
  );

  const [selectedModule, setSelectedModule] = useState<Module | undefined>();
  const [rosterOpen, setRosterOpen] = useState(false);

  function openRoster(module: Module) {
    setSelectedModule(module);
    setRosterOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Module</h2>

      {isLoading && <p className="text-muted-foreground">Lade Module…</p>}
      {!isLoading && !sortedModules.length && (
        <p className="text-muted-foreground">Noch keine Module angelegt.</p>
      )}

      {!!sortedModules.length && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Lehrer</TableHead>
              <TableHead>Belegung</TableHead>
              <TableHead title="Median der Präferenz-Ränge der zugewiesenen Schüler (1 = Erstwunsch)">
                Median-Prio
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedModules.map((module) => (
              <TableRow key={module.id} onClick={() => openRoster(module)} className="cursor-pointer">
                <TableCell className="font-medium">{module.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {module.displayScheduleLabel || "–"}
                </TableCell>
                <TableCell className="text-muted-foreground">{module.teacher || "–"}</TableCell>
                <TableCell>
                  <CapacityBar studentCount={module.studentCount} min={module.min} max={module.max} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {module.medianPreference ?? "–"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {projectId && (
        <ModuleRosterDialog
          projectId={projectId}
          module={selectedModule}
          open={rosterOpen}
          onOpenChange={setRosterOpen}
        />
      )}
    </div>
  );
}

function fillRatio(module: Module) {
  return module.max > 0 ? module.studentCount / module.max : 0;
}
