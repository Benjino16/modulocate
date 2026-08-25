import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../trpc";
import { ProjectContext, STORAGE_KEY } from "./use-project";

export function ProjectProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const { data: projects = [], isLoading } = useQuery(trpc.projects.list.queryOptions());
  const [storedProjectId, setProjectId] = useState<string | undefined>(
    () => localStorage.getItem(STORAGE_KEY) ?? undefined,
  );

  // Falls back to the first available project once the list loads and no
  // (still valid) selection exists yet — e.g. first visit or a stale id.
  // Derived at render time rather than via an effect that calls setState,
  // so there's no extra render pass while the fallback "catches up".
  const projectId =
    projects.length === 0 || (storedProjectId && projects.some((p) => p.id === storedProjectId))
      ? storedProjectId
      : projects[0]?.id;

  useEffect(() => {
    if (projectId) localStorage.setItem(STORAGE_KEY, projectId);
  }, [projectId]);

  const value = useMemo(
    () => ({ projects, projectId, setProjectId, isLoading }),
    [projects, projectId, isLoading],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
