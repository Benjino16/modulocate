import { and, eq, inArray } from "drizzle-orm";
import type { DbExecutor } from "./client";
import { modules, studentInModule, studentPreferences } from "./schema";
import { resolveStudentEligibility } from "./eligibility";

export interface StudentModuleOption {
  id: string;
  name: string;
  min: number;
  max: number;
  studentCount: number;
  preference: number | null;
  assigned: boolean;
}

// Modules a given student is currently allowed to see (their eligible list,
// same resolution used by the vote app — see eligibility.ts), annotated with
// their own preference rank and whether they're already assigned, for the
// manual-assignment dialog. Sorted by preference ascending (1 = most
// preferred first), unranked modules last — same convention as
// modules.roster's per-module student list, just from the other side.
export async function resolveStudentModuleOptions(
  executor: DbExecutor,
  { projectId, studentId }: { projectId: string; studentId: string },
): Promise<StudentModuleOption[]> {
  const [eligibility] = await resolveStudentEligibility(executor, { projectId, studentIds: [studentId] });
  const eligibleModuleIds = eligibility?.eligibleModuleIds ?? [];
  if (eligibleModuleIds.length === 0) return [];

  const [moduleRows, assignmentRows, ownAssignmentRows, preferenceRows] = await Promise.all([
    executor
      .select()
      .from(modules)
      .where(and(eq(modules.projectId, projectId), inArray(modules.id, eligibleModuleIds))),
    executor
      .select({ moduleId: studentInModule.moduleId })
      .from(studentInModule)
      .where(and(eq(studentInModule.projectId, projectId), inArray(studentInModule.moduleId, eligibleModuleIds))),
    executor
      .select({ moduleId: studentInModule.moduleId })
      .from(studentInModule)
      .where(and(eq(studentInModule.projectId, projectId), eq(studentInModule.studentId, studentId))),
    executor
      .select({ moduleId: studentPreferences.moduleId, preference: studentPreferences.preference })
      .from(studentPreferences)
      .where(and(eq(studentPreferences.projectId, projectId), eq(studentPreferences.studentId, studentId))),
  ]);

  const studentCountByModule = new Map<string, number>();
  for (const row of assignmentRows) {
    studentCountByModule.set(row.moduleId, (studentCountByModule.get(row.moduleId) ?? 0) + 1);
  }
  const assignedModuleIds = new Set(ownAssignmentRows.map((row) => row.moduleId));
  const preferenceByModule = new Map(preferenceRows.map((row) => [row.moduleId, row.preference]));

  const options: StudentModuleOption[] = moduleRows.map((module) => ({
    id: module.id,
    name: module.name,
    min: module.min,
    max: module.max,
    studentCount: studentCountByModule.get(module.id) ?? 0,
    preference: preferenceByModule.get(module.id) ?? null,
    assigned: assignedModuleIds.has(module.id),
  }));

  return options.sort((a, b) => (a.preference ?? Infinity) - (b.preference ?? Infinity));
}
