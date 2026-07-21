import { describe, expect, it } from "vitest";
import { allocate } from "./allocate";
import type {
  AllocationConfig,
  AllocationInput,
  AllocationModule,
  AllocationRule,
  AllocationStudent,
  CategoryId,
  ModuleId,
  RuleId,
  StudentId,
  SubRuleId,
} from "./types";

const defaultConfig: AllocationConfig = { prioPercent: 0.2, seed: 1 };

function id<T extends string>(value: string): T {
  return value as T;
}

function module(
  moduleId: string,
  opts: Partial<Pick<AllocationModule, "min" | "max" | "categoryIds" | "dateIds">> = {},
): AllocationModule {
  return {
    id: id<ModuleId>(moduleId),
    min: opts.min ?? 0,
    max: opts.max ?? 10,
    categoryIds: opts.categoryIds ?? [],
    dateIds: opts.dateIds ?? [],
  };
}

function rule(ruleId: string, opts: Partial<Pick<AllocationRule, "moduleCount" | "priority" | "subRules">> = {}): AllocationRule {
  return {
    id: id<RuleId>(ruleId),
    moduleCount: opts.moduleCount ?? 1,
    priority: opts.priority ?? false,
    subRules: opts.subRules ?? [],
  };
}

function student(
  studentId: string,
  ruleId: string,
  opts: Partial<Pick<AllocationStudent, "preferences" | "eligibleModuleIds" | "groupIds">> = {},
): AllocationStudent {
  const eligibleModuleIds = opts.eligibleModuleIds ?? (opts.preferences ?? []).map((p) => p.moduleId);
  return {
    id: id<StudentId>(studentId),
    groupIds: opts.groupIds ?? [],
    ruleId: id<RuleId>(ruleId),
    preferences: opts.preferences ?? [],
    eligibleModuleIds,
  };
}

function baseInput(overrides: Partial<AllocationInput> = {}): AllocationInput {
  return {
    students: [],
    modules: [],
    categories: [],
    groups: [],
    rules: [],
    ...overrides,
  };
}

describe("allocate", () => {
  it("assigns each student's top preference when capacity is plentiful", () => {
    const r = rule("r1", { moduleCount: 1 });
    const input = baseInput({
      rules: [r],
      modules: [module("m1", { max: 5 }), module("m2", { max: 5 })],
      students: [
        student("s1", "r1", {
          preferences: [
            { moduleId: id("m1"), rank: 1 },
            { moduleId: id("m2"), rank: 2 },
          ],
        }),
        student("s2", "r1", {
          preferences: [
            { moduleId: id("m2"), rank: 1 },
            { moduleId: id("m1"), rank: 2 },
          ],
        }),
      ],
    });

    const result = allocate(input, defaultConfig);

    expect(result.assignments).toContainEqual({ studentId: id("s1"), moduleId: id("m1") });
    expect(result.assignments).toContainEqual({ studentId: id("s2"), moduleId: id("m2") });
    expect(result.issues).toEqual([]);
    expect(result.metrics.score).toBe(100); // both got rank 1
    // every input module gets a zeroed entry even with no contention, so callers
    // can index by id without a presence check
    expect(result.metrics.moduleDemand[id<ModuleId>("m1")]).toEqual({ rejections: 0, rejectionsViaRuleRequirement: 0 });
    expect(result.metrics.moduleDemand[id<ModuleId>("m2")]).toEqual({ rejections: 0, rejectionsViaRuleRequirement: 0 });
  });

  it("is deterministic for a fixed seed and can differ across seeds under contention", () => {
    const r = rule("r1", { moduleCount: 1 });
    const input = baseInput({
      rules: [r],
      modules: [module("m1", { max: 1 })],
      students: [
        student("s1", "r1", { preferences: [{ moduleId: id("m1"), rank: 1 }] }),
        student("s2", "r1", { preferences: [{ moduleId: id("m1"), rank: 1 }] }),
      ],
    });

    const runA = allocate(input, { prioPercent: 0.2, seed: 42 });
    const runB = allocate(input, { prioPercent: 0.2, seed: 42 });
    expect(runA.assignments).toEqual(runB.assignments);

    // Exactly one of the two students gets the single slot, the other is unassigned.
    expect(runA.assignments).toHaveLength(1);
    expect(runA.metrics.unassignedCount).toBe(1);
  });

  it("reserves prio-round capacity for priority-rule students", () => {
    const prioRule = rule("prio", { moduleCount: 1, priority: true });
    const normalRule = rule("normal", { moduleCount: 1, priority: false });
    const input = baseInput({
      rules: [prioRule, normalRule],
      modules: [module("m1", { max: 1 })],
      students: [
        // Non-prio student "arrives" first in listing order but must not win the
        // single reserved-then-released slot against the prio student.
        student("normalStudent", "normal", { preferences: [{ moduleId: id("m1"), rank: 1 }] }),
        student("prioStudent", "prio", { preferences: [{ moduleId: id("m1"), rank: 1 }] }),
      ],
    });

    const result = allocate(input, { prioPercent: 1, seed: 7 });
    expect(result.assignments).toEqual([{ studentId: id("prioStudent"), moduleId: id("m1") }]);
  });

  it("releases unused prio capacity back to the normal round", () => {
    const prioRule = rule("prio", { moduleCount: 1, priority: true });
    const normalRule = rule("normal", { moduleCount: 1, priority: false });
    const input = baseInput({
      rules: [prioRule, normalRule],
      modules: [module("m1", { max: 1 })],
      // No prio student ranks m1, so its reserved slot must be released to the normal round.
      students: [
        student("prioStudent", "prio", { preferences: [] }),
        student("normalStudent", "normal", { preferences: [{ moduleId: id("m1"), rank: 1 }] }),
      ],
    });

    const result = allocate(input, { prioPercent: 1, seed: 7 });
    expect(result.assignments).toEqual([{ studentId: id("normalStudent"), moduleId: id("m1") }]);
  });

  it("satisfies '2x Sport' via two distinct sub-rules over two distinct modules", () => {
    const sport: CategoryId = id("sport");
    const r = rule("r1", {
      moduleCount: 2,
      subRules: [
        { id: id<SubRuleId>("sub1"), categoryIds: [sport] },
        { id: id<SubRuleId>("sub2"), categoryIds: [sport] },
      ],
    });
    const input = baseInput({
      rules: [r],
      modules: [
        module("football", { max: 5, categoryIds: [sport] }),
        module("basketball", { max: 5, categoryIds: [sport] }),
      ],
      students: [
        student("s1", "r1", {
          preferences: [
            { moduleId: id("football"), rank: 1 },
            { moduleId: id("basketball"), rank: 2 },
          ],
        }),
      ],
    });

    const result = allocate(input, defaultConfig);
    const assignedModuleIds = result.assignments.map((a) => a.moduleId).sort();
    expect(assignedModuleIds).toEqual(["basketball", "football"]);
    expect(result.issues).toEqual([]);
  });

  it("reports a rule_violation when an open sub-rule cannot be satisfied", () => {
    const sport: CategoryId = id("sport");
    const r = rule("r1", {
      moduleCount: 1,
      subRules: [{ id: id<SubRuleId>("sub1"), categoryIds: [sport] }],
    });
    const input = baseInput({
      rules: [r],
      modules: [module("art", { max: 5, categoryIds: [] })],
      students: [student("s1", "r1", { preferences: [{ moduleId: id("art"), rank: 1 }] })],
    });

    const result = allocate(input, defaultConfig);
    expect(result.assignments).toEqual([{ studentId: id("s1"), moduleId: id("art") }]);
    expect(result.issues).toContainEqual({
      type: "rule_violation",
      studentId: id("s1"),
      detail: "1 von 1 Teilregeln nicht erfüllt",
    });
  });

  it("excludes modules whose dates overlap with an already-assigned module", () => {
    const r = rule("r1", { moduleCount: 2 });
    const input = baseInput({
      rules: [r],
      modules: [
        module("m1", { max: 5, dateIds: [id("monday")] }),
        module("m2", { max: 5, dateIds: [id("monday")] }),
        module("m3", { max: 5, dateIds: [id("tuesday")] }),
      ],
      students: [
        student("s1", "r1", {
          preferences: [
            { moduleId: id("m1"), rank: 1 },
            { moduleId: id("m2"), rank: 2 },
            { moduleId: id("m3"), rank: 3 },
          ],
        }),
      ],
    });

    const result = allocate(input, defaultConfig);
    const assignedModuleIds = result.assignments.map((a) => a.moduleId).sort();
    expect(assignedModuleIds).toEqual(["m1", "m3"]);
  });

  it("reports below_min_capacity for a module that ends up under its minimum", () => {
    const r = rule("r1", { moduleCount: 1 });
    const input = baseInput({
      rules: [r],
      modules: [module("m1", { max: 5, min: 3 })],
      students: [student("s1", "r1", { preferences: [{ moduleId: id("m1"), rank: 1 }] })],
    });

    const result = allocate(input, defaultConfig);
    expect(result.issues).toContainEqual({
      type: "below_min_capacity",
      moduleId: id("m1"),
      detail: "1 von min. 3 belegt",
    });
  });

  it("only assigns eligible-but-unranked modules as a last resort, never displacing a ranked one", () => {
    const r = rule("r1", { moduleCount: 2 });
    const input = baseInput({
      rules: [r],
      modules: [module("ranked", { max: 5 }), module("filler", { max: 5 })],
      students: [
        student("s1", "r1", {
          preferences: [{ moduleId: id("ranked"), rank: 1 }],
          eligibleModuleIds: [id("ranked"), id("filler")],
        }),
      ],
    });

    const result = allocate(input, defaultConfig);
    const assignedModuleIds = result.assignments.map((a) => a.moduleId).sort();
    expect(assignedModuleIds).toEqual(["filler", "ranked"]);
    expect(result.metrics.preferenceDistribution[0]).toBe(1); // filler counted as unranked
    expect(result.metrics.preferenceDistribution[1]).toBe(1);
  });

  it("records a moduleDemand rejection when a student's next reachable candidate is full", () => {
    const r = rule("r1", { moduleCount: 1 });
    const input = baseInput({
      rules: [r],
      modules: [module("m1", { max: 1 }), module("m2", { max: 5 })],
      students: [
        student("s1", "r1", {
          preferences: [
            { moduleId: id("m1"), rank: 1 },
            { moduleId: id("m2"), rank: 2 },
          ],
        }),
        student("s2", "r1", {
          preferences: [
            { moduleId: id("m1"), rank: 1 },
            { moduleId: id("m2"), rank: 2 },
          ],
        }),
      ],
    });

    const result = allocate(input, defaultConfig);

    // whichever of s1/s2 loses the tie-break for m1's single seat still ends
    // up with m2 — but the loss itself must show up as a rejection against m1
    expect(result.metrics.moduleDemand[id<ModuleId>("m1")]).toEqual({ rejections: 1, rejectionsViaRuleRequirement: 0 });
    expect(result.metrics.moduleDemand[id<ModuleId>("m2")]).toEqual({ rejections: 0, rejectionsViaRuleRequirement: 0 });
  });

  it("propagates rejections through knock-on displacement (module A full pushes demand onto module B)", () => {
    const r = rule("r1", { moduleCount: 1 });
    const input = baseInput({
      rules: [r],
      modules: [module("bouldern", { max: 1 }), module("volleyball", { max: 1 })],
      students: ["s1", "s2", "s3"].map((sid) =>
        student(sid, "r1", {
          preferences: [
            { moduleId: id("bouldern"), rank: 1 },
            { moduleId: id("volleyball"), rank: 2 },
          ],
        }),
      ),
    });

    const result = allocate(input, defaultConfig);

    // 1 of 3 gets bouldern outright, 1 of 3 gets displaced into volleyball,
    // and the 3rd is rejected from both in turn — a naive "count rank-1
    // votes" statistic would show zero demand for volleyball despite it
    // also running out.
    expect(result.metrics.moduleDemand[id<ModuleId>("bouldern")].rejections).toBe(2);
    expect(result.metrics.moduleDemand[id<ModuleId>("volleyball")].rejections).toBe(1);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: "unassigned", detail: "0 von 1 Modulen zugewiesen" }),
    );
  });

  it("flags a rejection as rule-driven when the full module was next up only to satisfy an open sub-rule", () => {
    const sportCategory = id<CategoryId>("sport");
    // priority rule, no sub-rules of its own — s0's only job is to take the
    // sport module's single seat in the prio round, deterministically (no
    // tie-break involved, since s0 is the only priority-rule student), before
    // the actual test subject ever gets a turn.
    const priorityRule = rule("r0", { moduleCount: 1, priority: true });
    const r = rule("r1", {
      moduleCount: 2,
      subRules: [{ id: id<SubRuleId>("sr1"), categoryIds: [sportCategory] }],
    });
    const input = baseInput({
      rules: [priorityRule, r],
      categories: [{ id: sportCategory }],
      modules: [module("m_sport", { max: 1, categoryIds: [sportCategory] }), module("m_a", { max: 5 })],
      students: [
        student("s0", "r0", { preferences: [{ moduleId: id("m_sport"), rank: 1 }] }),
        // ranks the non-sport module first (genuinely, plenty of capacity —
        // that pick is never in question) but still needs "1x sport"; by the
        // time that's the only thing left to satisfy, m_sport is already gone.
        student("s_needy", "r1", {
          preferences: [
            { moduleId: id("m_a"), rank: 1 },
            { moduleId: id("m_sport"), rank: 2 },
          ],
        }),
      ],
    });

    const result = allocate(input, defaultConfig);

    expect(result.assignments).toContainEqual({ studentId: id("s0"), moduleId: id("m_sport") });
    expect(result.assignments).toContainEqual({ studentId: id("s_needy"), moduleId: id("m_a") });
    expect(result.metrics.moduleDemand[id<ModuleId>("m_sport")]).toEqual({ rejections: 1, rejectionsViaRuleRequirement: 1 });
  });

  it("throws if a student references a rule not present in the input", () => {
    const input = baseInput({
      rules: [],
      modules: [],
      students: [student("s1", "missing-rule")],
    });

    expect(() => allocate(input, defaultConfig)).toThrow();
  });
});
