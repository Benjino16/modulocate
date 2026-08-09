import { allocate } from "@modulocate/allocation-engine";
import type {
  AllocationInput,
  AllocationResult,
  CategoryId,
  DateId,
  ModuleId,
  RuleId,
  StudentId,
  SubRuleId,
} from "@modulocate/allocation-engine";

export interface SimulationModule {
  id: string;
  min: number;
  max: number;
  categoryIds: string[];
  dateIds: string[];
}

export interface SimulationRule {
  id: string;
  moduleCount: number;
  priority: boolean;
  subRules: { id: string; categoryIds: string[] }[];
}

// Runs the exact same allocation-engine used for real runs (see
// apps/worker/src/processors/allocationRun.ts), but with an AllocationInput
// containing only this one student — i.e. "what would I get if there were no
// competition from other students". Pure/synchronous, safe to call on every
// reorder (e.g. from a useMemo) with no network round-trip.
//
// prioPercent: 1 + seed: 0 are fixed, not derived from any real project
// config: with a single student, the prio round (if entered at all) reserves
// full capacity, so it and the normal round converge on the same assignment
// set either way; the seed only matters for tie-breaks between multiple
// "neediest" students, which can't happen with one. rule.priority is still
// passed through unchanged so the simulated rule matches the real one.
export function simulateOwnAllocation(
  studentId: string,
  orderedModuleIds: string[],
  modules: SimulationModule[],
  rule: SimulationRule,
): AllocationResult {
  const input: AllocationInput = {
    students: [
      {
        id: studentId as StudentId,
        groupIds: [],
        ruleId: rule.id as RuleId,
        preferences: orderedModuleIds.map((moduleId, index) => ({
          moduleId: moduleId as ModuleId,
          rank: index + 1,
        })),
        eligibleModuleIds: orderedModuleIds as ModuleId[],
      },
    ],
    modules: modules.map((module) => ({
      id: module.id as ModuleId,
      min: module.min,
      max: module.max,
      categoryIds: module.categoryIds as CategoryId[],
      dateIds: module.dateIds as DateId[],
    })),
    categories: [],
    groups: [],
    rules: [
      {
        id: rule.id as RuleId,
        moduleCount: rule.moduleCount,
        priority: rule.priority,
        subRules: rule.subRules.map((subRule) => ({
          id: subRule.id as SubRuleId,
          categoryIds: subRule.categoryIds as CategoryId[],
        })),
      },
    ],
  };

  return allocate(input, { prioPercent: 1, seed: 0 });
}
