import type { AllocationModule, AllocationRule, AllocationSubRule, CategoryId, ModuleId, RuleEvaluation, SubRuleId } from "./types";

// Checks a *fixed* set of already-assigned modules against a rule (admin
// review UI, planning.md Phase 4) — a different problem from allocate()'s
// creditSubRule, and deliberately solved differently:
//
// creditSubRule runs greedily, once per assignment, inside a loop juggling
// hundreds of students and modules — exact set-cover matching there would be
// far too expensive (NP-hard in general) to run at every step. It can
// therefore under-report ("rule not satisfied" when a different combination
// would have worked), which is an acceptable trade-off mid-allocation.
//
// Here there is exactly one student's already-fixed, small module list
// (bounded by their rule's moduleCount, typically single digits) against a
// handful of sub-rules — small enough to search exactly via backtracking, and
// an admin-facing "is this actually satisfied" indicator shouldn't carry the
// greedy heuristic's false negatives.
export function evaluateRuleFulfillment(assignedModules: AllocationModule[], rule: AllocationRule): RuleEvaluation {
  const requiredCategoryIds = new Set<CategoryId>(rule.subRules.flatMap((sr) => sr.categoryIds));
  // Modules that can't contribute a single required category are irrelevant to
  // the search entirely — pruned up front rather than branched on.
  const candidates = assignedModules
    .map((module) => ({ module, categorySet: new Set(module.categoryIds) }))
    .filter((c) => [...c.categorySet].some((categoryId) => requiredCategoryIds.has(categoryId)));

  const best = searchBestAssignment(candidates, rule.subRules);

  const subRules = rule.subRules.map((subRule) => {
    const coveredCategoryIds = best.coverageBySubRule.get(subRule.id) ?? new Set<CategoryId>();
    const missingCategoryIds = subRule.categoryIds.filter((c) => !coveredCategoryIds.has(c));
    return {
      subRuleId: subRule.id,
      satisfied: missingCategoryIds.length === 0,
      missingCategoryIds,
      coveredByModuleIds: best.moduleIdsBySubRule.get(subRule.id) ?? [],
    };
  });

  return {
    moduleCountTarget: rule.moduleCount,
    moduleCountAssigned: assignedModules.length,
    moduleCountSatisfied: assignedModules.length >= rule.moduleCount,
    subRules,
  };
}

interface Candidate {
  module: AllocationModule;
  categorySet: Set<CategoryId>;
}

interface SearchResult {
  satisfiedCount: number;
  coverageBySubRule: Map<SubRuleId, Set<CategoryId>>;
  moduleIdsBySubRule: Map<SubRuleId, ModuleId[]>;
}

// Backtracks over "assign this module to one still-open sub-rule it can help,
// or to none", maximizing the number of fully-covered sub-rules. Exponential
// in the worst case, but bounded by candidates.length (<= a student's
// moduleCount, typically single digits) and subRules.length (typically a
// handful) — this runs once per student on demand, not inside the
// allocation hot loop, so that's an acceptable trade-off at school scale.
function searchBestAssignment(candidates: Candidate[], subRules: AllocationSubRule[]): SearchResult {
  let best: SearchResult = {
    satisfiedCount: -1,
    coverageBySubRule: new Map(),
    moduleIdsBySubRule: new Map(),
  };

  function countSatisfied(coverage: Map<SubRuleId, Set<CategoryId>>): number {
    let count = 0;
    for (const subRule of subRules) {
      const covered = coverage.get(subRule.id);
      if (subRule.categoryIds.every((c) => covered?.has(c))) count += 1;
    }
    return count;
  }

  function recurse(
    index: number,
    coverage: Map<SubRuleId, Set<CategoryId>>,
    moduleIdsBySubRule: Map<SubRuleId, ModuleId[]>,
  ): void {
    const currentSatisfied = countSatisfied(coverage);

    if (index === candidates.length) {
      if (currentSatisfied > best.satisfiedCount) {
        best = {
          satisfiedCount: currentSatisfied,
          coverageBySubRule: cloneCoverage(coverage),
          moduleIdsBySubRule: cloneModuleMap(moduleIdsBySubRule),
        };
      }
      return;
    }

    // Prune: even if every remaining candidate fully completed a distinct,
    // still-open sub-rule (an optimistic upper bound — a module usually only
    // partially covers one), this branch couldn't beat the best found so far.
    const remaining = candidates.length - index;
    const openSubRules = subRules.length - currentSatisfied;
    if (currentSatisfied + Math.min(remaining, openSubRules) <= best.satisfiedCount) return;

    const { module, categorySet } = candidates[index];

    for (const subRule of subRules) {
      const covered = coverage.get(subRule.id) ?? new Set<CategoryId>();
      if (subRule.categoryIds.every((c) => covered.has(c))) continue; // already satisfied
      const helps = subRule.categoryIds.some((c) => categorySet.has(c) && !covered.has(c));
      if (!helps) continue;

      const nextCovered = new Set(covered);
      for (const c of subRule.categoryIds) if (categorySet.has(c)) nextCovered.add(c);
      const nextCoverage = cloneCoverage(coverage);
      nextCoverage.set(subRule.id, nextCovered);

      const nextModuleIds = cloneModuleMap(moduleIdsBySubRule);
      nextModuleIds.set(subRule.id, [...(nextModuleIds.get(subRule.id) ?? []), module.id]);

      recurse(index + 1, nextCoverage, nextModuleIds);
    }

    // Option: don't credit this module to any sub-rule.
    recurse(index + 1, coverage, moduleIdsBySubRule);
  }

  recurse(0, new Map(), new Map());
  return best;
}

function cloneCoverage(coverage: Map<SubRuleId, Set<CategoryId>>): Map<SubRuleId, Set<CategoryId>> {
  return new Map([...coverage].map(([k, v]) => [k, new Set(v)]));
}

function cloneModuleMap(map: Map<SubRuleId, ModuleId[]>): Map<SubRuleId, ModuleId[]> {
  return new Map([...map].map(([k, v]) => [k, [...v]]));
}
