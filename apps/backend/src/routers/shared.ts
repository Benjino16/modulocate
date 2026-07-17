import { z } from "zod";
import { db } from "../db";

// Stopgap until auth/project-context middleware exists: projectId is an
// explicit input instead of being derived from ctx. Once a session carries
// the current project, this merges away and procedures read ctx.projectId.
export const projectScoped = z.object({ projectId: z.uuid() });

// db itself or an open transaction — whatever `db.transaction(async (tx) => ...)` hands back.
export type DbExecutor = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];
