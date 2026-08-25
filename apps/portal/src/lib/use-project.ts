import { createContext, useContext } from "react";
import type { ProjectPhase } from "@modulocate/shared";

export const STORAGE_KEY = "modulocate.selectedProjectId";

type Project = { id: string; name: string; phase: ProjectPhase };

type ProjectContextValue = {
  projects: Project[];
  projectId: string | undefined;
  setProjectId: (id: string) => void;
  isLoading: boolean;
};

// Lives here rather than in project-context.tsx so that file exports only
// the ProjectProvider component (a context export alongside it would break
// Fast Refresh the same way a hook export would).
export const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a ProjectProvider");
  return ctx;
}
