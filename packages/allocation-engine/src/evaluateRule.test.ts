import { describe, expect, it } from "vitest";
import { evaluateRuleFulfillment } from "./evaluateRule";
import type { AllocationModule, AllocationRule, CategoryId, ModuleId, RuleId, SubRuleId } from "./types";

function id<T extends string>(value: string): T {
  return value as T;
}

function module(moduleId: string, categoryIds: string[]): AllocationModule {
  return { id: id<ModuleId>(moduleId), min: 0, max: 10, categoryIds: categoryIds.map((c) => id<CategoryId>(c)), dateIds: [] };
}

function rule(subRuleCategoryLists: string[][], moduleCount = 1): AllocationRule {
  return {
    id: id<RuleId>("r1"),
    moduleCount,
    priority: false,
    subRules: subRuleCategoryLists.map((categoryIds, i) => ({
      id: id<SubRuleId>(`sub${i}`),
      categoryIds: categoryIds.map((c) => id<CategoryId>(c)),
    })),
  };
}

describe("evaluateRuleFulfillment", () => {
  it("reports moduleCount satisfaction", () => {
    const result = evaluateRuleFulfillment([module("m1", [])], rule([], 2));
    expect(result.moduleCountTarget).toBe(2);
    expect(result.moduleCountAssigned).toBe(1);
    expect(result.moduleCountSatisfied).toBe(false);
  });

  it("satisfies '2x Sport' with two distinct sport modules", () => {
    const result = evaluateRuleFulfillment(
      [module("football", ["sport"]), module("basketball", ["sport"])],
      rule([["sport"], ["sport"]], 2),
    );
    expect(result.subRules.every((sr) => sr.satisfied)).toBe(true);
    expect(result.subRules.flatMap((sr) => sr.coveredByModuleIds).sort()).toEqual(["basketball", "football"]);
  });

  it("reports missing categories when a sub-rule can't be completed", () => {
    const result = evaluateRuleFulfillment([module("art", ["kunst"])], rule([["sport"]], 1));
    expect(result.subRules).toEqual([
      { subRuleId: id("sub0"), satisfied: false, missingCategoryIds: [id("sport")], coveredByModuleIds: [] },
    ]);
  });

  it("covers a multi-category sub-rule via set-cover across two modules", () => {
    const result = evaluateRuleFulfillment(
      [module("sportOnly", ["sport"]), module("artOnly", ["kunst"])],
      rule([["sport", "kunst"]], 2),
    );
    expect(result.subRules[0].satisfied).toBe(true);
    expect(result.subRules[0].coveredByModuleIds.sort()).toEqual(["artOnly", "sportOnly"]);
  });

  // The exact scenario where allocate.ts's greedy creditSubRule can fail: a
  // module that could go to either an already-partially-relevant multi-category
  // sub-rule or a single-category one. Greedy, order-dependent credit can lock
  // the combined module into the wrong sub-rule and strand the other. The
  // exact search here must find the one assignment that satisfies both.
  it("finds a satisfying assignment greedy per-step credit could miss", () => {
    const result = evaluateRuleFulfillment(
      [module("sportOnly", ["sport"]), module("sportAndKunst", ["sport", "kunst"])],
      rule(
        [
          ["sport", "kunst"], // sub0 — needs the combined module
          ["sport"], // sub1 — needs the sport-only module
        ],
        2,
      ),
    );
    expect(result.subRules.every((sr) => sr.satisfied)).toBe(true);
    expect(result.subRules[0].coveredByModuleIds).toEqual(["sportAndKunst"]);
    expect(result.subRules[1].coveredByModuleIds).toEqual(["sportOnly"]);
  });

  it("ignores modules irrelevant to every sub-rule", () => {
    const result = evaluateRuleFulfillment(
      [module("football", ["sport"]), module("music", ["musik"])],
      rule([["sport"]], 2),
    );
    expect(result.subRules[0].satisfied).toBe(true);
    expect(result.subRules[0].coveredByModuleIds).toEqual(["football"]);
  });

  it("returns no sub-rule evaluations when the rule has none", () => {
    const result = evaluateRuleFulfillment([module("m1", [])], rule([], 1));
    expect(result.subRules).toEqual([]);
  });
});
