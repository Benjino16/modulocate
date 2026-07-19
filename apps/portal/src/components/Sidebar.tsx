import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronsUpDown, Plus, Settings, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@modulocate/ui/components/dropdown-menu";
import { cn } from "@modulocate/ui/lib/utils";
import type { ProjectPhase } from "@modulocate/shared";
import { useProject } from "../lib/project-context";
import { ProjectDialog } from "./ProjectDialog";

const phases = [
  { to: "/data", number: 1, label: "Daten" },
  { to: "/survey", number: 2, label: "Umfrage" },
  { to: "/allocation", number: 3, label: "Zuteilung" },
  { to: "/adjustments", number: 4, label: "Anpassungen" },
  { to: "/results", number: 5, label: "Ergebnisse" },
] as const;

// Maps the project's backend phase to the sidebar step it belongs to.
const projectPhaseToStep: Record<ProjectPhase, (typeof phases)[number]["to"]> = {
  setup: "/data",
  voting: "/survey",
  closed: "/survey",
  allocating: "/allocation",
  reviewing: "/adjustments",
  finalized: "/results",
  published: "/results",
};

export function Sidebar() {
  const { projects, projectId, setProjectId } = useProject();
  const currentProject = projects.find((p) => p.id === projectId);
  const currentStep = currentProject ? projectPhaseToStep[currentProject.phase] : undefined;
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r bg-background">
      <div className="flex h-14 shrink-0 items-center border-b px-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-accent">
            <span className="truncate">{currentProject?.name ?? "Projekt wählen…"}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {projects.map((project) => (
              <DropdownMenuItem key={project.id} onSelect={() => setProjectId(project.id)}>
                {project.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setProjectDialogOpen(true)}>
              <Plus className="size-4" />
              Neues Projekt
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        onCreated={setProjectId}
      />

      <nav className="flex flex-1 flex-col justify-center gap-1 px-3">
        {phases.map((phase) => {
          const isCurrentPhase = phase.to === currentStep;
          return (
            <Link
              key={phase.to}
              to={phase.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                isCurrentPhase && "font-semibold text-foreground",
              )}
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                  isCurrentPhase && "border-foreground bg-foreground text-background",
                )}
              >
                {phase.number}
              </span>
              {phase.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-1 border-t p-3">
        <Link
          to="/settings"
          className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-accent"
          activeProps={{ className: "bg-secondary" }}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary">
            <Settings className="size-4" />
          </span>
          Admin Einstellungen
        </Link>
        <Link
          to="/account"
          className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-accent"
          activeProps={{ className: "bg-secondary" }}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary">
            <User className="size-4" />
          </span>
          Account
        </Link>
      </div>
    </aside>
  );
}
