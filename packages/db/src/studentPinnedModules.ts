import { and, eq, inArray } from "drizzle-orm";
import type { DbExecutor } from "./client";
import { modules, moduleCategories, moduleInCategory, studentPinnedModule } from "./schema";
import { resolveModuleDisplayScheduleLabels } from "./moduleDisplay";

export interface StudentPinnableModule {
  id: string;
  name: string;
  displayScheduleLabel: string | null;
  categoryNames: string[];
  pinned: boolean;
}

// Every module in the project, annotated with whether it's pinned for this
// student — deliberately not eligibility-filtered (unlike
// resolveStudentModuleOptions) since pinning is meant to bypass blocked
// category/date rules, so a blocked module must still show up here to be
// pinnable. Basis for the pin dialog (StudentPinDialog.tsx).
export async function resolveStudentPinnableModules(
  executor: DbExecutor,
  { projectId, studentId }: { projectId: string; studentId: string },
): Promise<StudentPinnableModule[]> {
  const moduleRows = await executor.select().from(modules).where(eq(modules.projectId, projectId));
  if (moduleRows.length === 0) return [];

  const moduleIds = moduleRows.map((m) => m.id);
  const [pinnedRows, displayScheduleLabelByModule, categoryRows] = await Promise.all([
    executor
      .select({ moduleId: studentPinnedModule.moduleId })
      .from(studentPinnedModule)
      .where(and(eq(studentPinnedModule.projectId, projectId), eq(studentPinnedModule.studentId, studentId))),
    resolveModuleDisplayScheduleLabels(executor, moduleIds),
    executor
      .select({ moduleId: moduleInCategory.moduleId, categoryName: moduleCategories.name })
      .from(moduleInCategory)
      .innerJoin(moduleCategories, eq(moduleCategories.id, moduleInCategory.categoryId))
      .where(inArray(moduleInCategory.moduleId, moduleIds)),
  ]);

  const pinnedModuleIds = new Set(pinnedRows.map((row) => row.moduleId));
  const categoryNamesByModule = new Map<string, string[]>();
  for (const row of categoryRows) {
    const list = categoryNamesByModule.get(row.moduleId) ?? [];
    list.push(row.categoryName);
    categoryNamesByModule.set(row.moduleId, list);
  }

  return moduleRows
    .map((module) => ({
      id: module.id,
      name: module.name,
      displayScheduleLabel: module.scheduleLabel || displayScheduleLabelByModule.get(module.id) || null,
      categoryNames: categoryNamesByModule.get(module.id) ?? [],
      pinned: pinnedModuleIds.has(module.id),
    }))
    // Pinned modules first (so they don't get lost alphabetically among
    // everything else), alphabetical within each group.
    .sort((a, b) => (a.pinned === b.pinned ? a.name.localeCompare(b.name) : a.pinned ? -1 : 1));
}

// One entry per student who has at least one pinned module — basis for the
// "Angeheftete Module" column on the Zuteilung > Schüler tab. Students with
// no pins simply have no key in the returned map. Optional studentIds scopes
// the scan (same pattern as loadStudents' preferencesByStudent query) for
// callers that only need one or a few students, e.g. after create/update.
export async function resolvePinnedModulesByStudent(
  executor: DbExecutor,
  { projectId, studentIds }: { projectId: string; studentIds?: string[] },
): Promise<Map<string, { id: string; name: string }[]>> {
  const rows = await executor
    .select({ studentId: studentPinnedModule.studentId, moduleId: modules.id, moduleName: modules.name })
    .from(studentPinnedModule)
    .innerJoin(modules, eq(modules.id, studentPinnedModule.moduleId))
    .where(
      studentIds
        ? and(eq(studentPinnedModule.projectId, projectId), inArray(studentPinnedModule.studentId, studentIds))
        : eq(studentPinnedModule.projectId, projectId),
    );

  const byStudent = new Map<string, { id: string; name: string }[]>();
  for (const row of rows) {
    const list = byStudent.get(row.studentId) ?? [];
    list.push({ id: row.moduleId, name: row.moduleName });
    byStudent.set(row.studentId, list);
  }
  return byStudent;
}
