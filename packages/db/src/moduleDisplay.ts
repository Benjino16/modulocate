import { eq, inArray } from "drizzle-orm";
import type { DbExecutor } from "./client";
import { dates, moduleInDate } from "./schema";

// Default display label for a module that has no explicit scheduleLabel —
// its dates' names, comma-separated (e.g. "Q1-Mo, Q2-Mo"). Shared between
// every place a module gets sent over the API (modules router, vote router)
// so "no scheduleLabel" always resolves to the same thing rather than each
// caller re-deriving it (and risking drift, e.g. a different separator).
export async function resolveModuleDisplayScheduleLabels(
  executor: DbExecutor,
  moduleIds: string[],
): Promise<Map<string, string>> {
  if (moduleIds.length === 0) return new Map();

  const rows = await executor
    .select({ moduleId: moduleInDate.moduleId, dateName: dates.name })
    .from(moduleInDate)
    .innerJoin(dates, eq(dates.id, moduleInDate.dateId))
    .where(inArray(moduleInDate.moduleId, moduleIds));

  const namesByModule = new Map<string, string[]>();
  for (const row of rows) {
    const list = namesByModule.get(row.moduleId) ?? [];
    list.push(row.dateName);
    namesByModule.set(row.moduleId, list);
  }

  const labelByModule = new Map<string, string>();
  for (const [moduleId, names] of namesByModule) {
    labelByModule.set(moduleId, names.join(", "));
  }
  return labelByModule;
}
