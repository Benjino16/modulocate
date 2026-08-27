import { describe, expect, it } from "vitest";
import { isBetterAllocationResult } from "./compareResults";
import type { AllocationIssue, AllocationResult, ModuleId } from "./types";

function result(
  overrides: Partial<{
    unassignedCount: number;
    ruleViolationCount: number;
    belowMinCapacityCount: number;
    score: number;
  }> = {},
): AllocationResult {
  const { unassignedCount = 0, ruleViolationCount = 0, belowMinCapacityCount = 0, score = 0 } = overrides;
  const issues: AllocationIssue[] = [
    ...Array.from({ length: belowMinCapacityCount }, (_, i) => ({
      type: "below_min_capacity" as const,
      moduleId: `m${i}` as ModuleId,
      detail: "",
    })),
  ];
  return {
    assignments: [],
    issues,
    metrics: {
      score,
      unassignedCount,
      ruleViolationCount,
      preferenceDistribution: {},
      moduleDemand: {},
    },
  };
}

describe("isBetterAllocationResult", () => {
  it("prefers fewer unassigned students over a higher score", () => {
    const candidate = result({ unassignedCount: 1, score: 100 });
    const current = result({ unassignedCount: 2, score: 0 });
    expect(isBetterAllocationResult(candidate, current)).toBe(true);
  });

  it("prefers fewer rule violations once unassigned counts tie", () => {
    const candidate = result({ ruleViolationCount: 1, score: 0 });
    const current = result({ ruleViolationCount: 2, score: 100 });
    expect(isBetterAllocationResult(candidate, current)).toBe(true);
  });

  it("prefers fewer below-min-capacity modules once unassigned/rule-violation counts tie", () => {
    const candidate = result({ belowMinCapacityCount: 0, score: 0 });
    const current = result({ belowMinCapacityCount: 1, score: 100 });
    expect(isBetterAllocationResult(candidate, current)).toBe(true);
  });

  it("falls back to score once every violation count ties", () => {
    const candidate = result({ score: 80 });
    const current = result({ score: 79 });
    expect(isBetterAllocationResult(candidate, current)).toBe(true);
    expect(isBetterAllocationResult(current, candidate)).toBe(false);
  });

  it("is false for two equally good results", () => {
    const a = result({ score: 50 });
    const b = result({ score: 50 });
    expect(isBetterAllocationResult(a, b)).toBe(false);
  });
});
