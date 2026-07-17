import { z } from "zod";

// Stopgap until auth/project-context middleware exists: projectId is an
// explicit input instead of being derived from ctx. Once a session carries
// the current project, this merges away and procedures read ctx.projectId.
export const projectScoped = z.object({ projectId: z.uuid() });

export type { DbExecutor } from "@modulocate/db";
