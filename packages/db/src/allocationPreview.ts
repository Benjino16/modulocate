import { eq, inArray } from "drizzle-orm";
import type { DbExecutor } from "./client";
import { categoryInSubRule, moduleInCategory, moduleInDate, rules, subRules } from "./schema";

export interface AllocationRulePreview {
  id: string;
  // name/description are display-only — never read by the allocation engine
  // itself, only by the vote app's pre-survey rule-text screen.
  name: string;
  description: string | null;
  moduleCount: number;
  priority: boolean;
  subRules: { id: string; categoryIds: string[] }[];
}

// Single-rule counterpart to ruleCompliance.ts's per-project rule fetch — used
// by the vote app's client-side "what would I get" preview (see
// simulateAllocation.ts in apps/vote), which only ever needs the one rule
// effective for the logged-in student, not every rule in the project.
export async function resolveAllocationRuleById(
  executor: DbExecutor,
  ruleId: string,
): Promise<AllocationRulePreview | null> {
  const [ruleRow] = await executor.select().from(rules).where(eq(rules.id, ruleId));
  if (!ruleRow) return null;

  const subRuleRows = await executor.select().from(subRules).where(eq(subRules.ruleId, ruleId));
  const subRuleIds = subRuleRows.map((row) => row.id);
  const categoryRows = subRuleIds.length
    ? await executor.select().from(categoryInSubRule).where(inArray(categoryInSubRule.subRuleId, subRuleIds))
    : [];

  const categoryIdsBySubRule = new Map<string, string[]>();
  for (const row of categoryRows) {
    const list = categoryIdsBySubRule.get(row.subRuleId) ?? [];
    list.push(row.categoryId);
    categoryIdsBySubRule.set(row.subRuleId, list);
  }

  return {
    id: ruleRow.id,
    name: ruleRow.name,
    description: ruleRow.description,
    moduleCount: ruleRow.moduleCount,
    priority: ruleRow.priority,
    subRules: subRuleRows.map((row) => ({ id: row.id, categoryIds: categoryIdsBySubRule.get(row.id) ?? [] })),
  };
}

export interface ModuleAllocationFields {
  categoryIdsByModule: Map<string, string[]>;
  dateIdsByModule: Map<string, string[]>;
}

// Raw category/date membership per module, for the same client-side preview.
// Deliberately unfiltered by moduleCategories.hiddenInVote — a hidden
// category still counts toward sub-rule matching, only its *name* is hidden
// from students (see vote.ts's separate, filtered categoryNames query).
export async function resolveModuleAllocationFields(
  executor: DbExecutor,
  moduleIds: string[],
): Promise<ModuleAllocationFields> {
  if (moduleIds.length === 0) return { categoryIdsByModule: new Map(), dateIdsByModule: new Map() };

  const [categoryRows, dateRows] = await Promise.all([
    executor
      .select({ moduleId: moduleInCategory.moduleId, categoryId: moduleInCategory.categoryId })
      .from(moduleInCategory)
      .where(inArray(moduleInCategory.moduleId, moduleIds)),
    executor
      .select({ moduleId: moduleInDate.moduleId, dateId: moduleInDate.dateId })
      .from(moduleInDate)
      .where(inArray(moduleInDate.moduleId, moduleIds)),
  ]);

  const categoryIdsByModule = new Map<string, string[]>();
  for (const row of categoryRows) {
    const list = categoryIdsByModule.get(row.moduleId) ?? [];
    list.push(row.categoryId);
    categoryIdsByModule.set(row.moduleId, list);
  }

  const dateIdsByModule = new Map<string, string[]>();
  for (const row of dateRows) {
    const list = dateIdsByModule.get(row.moduleId) ?? [];
    list.push(row.dateId);
    dateIdsByModule.set(row.moduleId, list);
  }

  return { categoryIdsByModule, dateIdsByModule };
}
