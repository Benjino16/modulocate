import type { AllocationResult } from "./types";

// Used to pick the best of several allocate() runs over the same input
// (different seeds) — see the worker's `iterations` sweep. Hard-constraint
// violations always outrank preference quality: a run with fewer unassigned
// students or rule violations is "better" even at a lower score, since those
// need manual admin intervention afterwards while score is just a
// preference-satisfaction average. Score only breaks ties once every
// violation count matches.
export function isBetterAllocationResult(candidate: AllocationResult, current: AllocationResult): boolean {
  if (candidate.metrics.unassignedCount !== current.metrics.unassignedCount) {
    return candidate.metrics.unassignedCount < current.metrics.unassignedCount;
  }
  if (candidate.metrics.ruleViolationCount !== current.metrics.ruleViolationCount) {
    return candidate.metrics.ruleViolationCount < current.metrics.ruleViolationCount;
  }

  const candidateBelowMin = candidate.issues.filter((i) => i.type === "below_min_capacity").length;
  const currentBelowMin = current.issues.filter((i) => i.type === "below_min_capacity").length;
  if (candidateBelowMin !== currentBelowMin) {
    return candidateBelowMin < currentBelowMin;
  }

  return candidate.metrics.score > current.metrics.score;
}
