import { and, eq } from "drizzle-orm";
import type { DbExecutor } from "./client";
import { modules, studentPreferences } from "./schema";

export interface StudentPreference {
  moduleId: string;
  moduleName: string;
  preference: number;
}

// The student's own ranked submission, unfiltered by current eligibility —
// distinct from resolveStudentModuleOptions, which is scoped to modules the
// student is still allowed to see for the manual-assignment dialog. This is
// the raw "what did they vote for" view for the Umfrage tab.
export async function resolveStudentPreferences(
  executor: DbExecutor,
  { projectId, studentId }: { projectId: string; studentId: string },
): Promise<StudentPreference[]> {
  const rows = await executor
    .select({
      moduleId: studentPreferences.moduleId,
      moduleName: modules.name,
      preference: studentPreferences.preference,
    })
    .from(studentPreferences)
    .innerJoin(modules, eq(modules.id, studentPreferences.moduleId))
    .where(and(eq(studentPreferences.projectId, projectId), eq(studentPreferences.studentId, studentId)));

  return rows.sort((a, b) => a.preference - b.preference);
}
