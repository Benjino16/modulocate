import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../trpc";

const STORAGE_KEY = "modulocate.selectedProjectId";

type Project = { id: string; name: string };

type ProjectContextValue = {
  projects: Project[];
  projectId: string | undefined;
  setProjectId: (id: string) => void;
  isLoading: boolean;
};

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const { data: projects = [], isLoading } = useQuery(trpc.projects.list.queryOptions());
  const [projectId, setProjectId] = useState<string | undefined>(
    () => localStorage.getItem(STORAGE_KEY) ?? undefined,
  );

  // Falls back to the first available project once the list loads and no
  // (still valid) selection exists yet — e.g. first visit or a stale id.
  useEffect(() => {
    if (projects.length === 0) return;
    if (projectId && projects.some((p) => p.id === projectId)) return;
    setProjectId(projects[0].id);
  }, [projects, projectId]);

  useEffect(() => {
    if (projectId) localStorage.setItem(STORAGE_KEY, projectId);
  }, [projectId]);

  const value = useMemo(
    () => ({ projects, projectId, setProjectId, isLoading }),
    [projects, projectId, isLoading],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a ProjectProvider");
  return ctx;
}
