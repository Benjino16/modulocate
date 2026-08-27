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
  opts: Partial<
    Pick<AllocationStudent, "preferences" | "eligibleModuleIds" | "groupIds" | "pinnedModuleIds">
  > = {},
): AllocationStudent {
  const eligibleModuleIds = opts.eligibleModuleIds ?? (opts.preferences ?? []).map((p) => p.moduleId);
  return {
    id: id<StudentId>(studentId),
    groupIds: opts.groupIds ?? [],
    ruleId: id<RuleId>(ruleId),
    preferences: opts.preferences ?? [],
    eligibleModuleIds,
    pinnedModuleIds: opts.pinnedModuleIds ?? [],
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

  it("still assigns unranked modules needed for open sub-rules in the prio round, even when top-ranked prefs alone would fill moduleCount", () => {
    const herz = id<CategoryId>("herz");
    const kopf = id<CategoryId>("kopf");
    const r = rule("r1", {
      moduleCount: 3,
      priority: true,
      subRules: [
        { id: id<SubRuleId>("sr_herz"), categoryIds: [herz] },
        { id: id<SubRuleId>("sr_kopf"), categoryIds: [kopf] },
      ],
    });
    const herzModules = ["herz1", "herz2", "herz3"].map((mid) => module(mid, { max: 30, categoryIds: [herz] }));
    const kopfModule = module("kopf1", { max: 30, categoryIds: [kopf] });

    const input = baseInput({
      rules: [r],
      modules: [...herzModules, kopfModule],
      students: [
        // Ranks exactly `moduleCount` (3) modules, all Herz, and never ranks
        // the Kopf module it's still required to get — only reachable via
        // eligibleModuleIds. The old prio-round window sliced the ranked+
        // unranked list down to `stillNeeded` *before* checking which
        // candidates could satisfy an open sub-rule, so kopf1 was silently
        // discarded and never even considered.
        student("test-user", "r1", {
          preferences: herzModules.map((m, i) => ({ moduleId: m.id, rank: i + 1 })),
          eligibleModuleIds: [...herzModules.map((m) => m.id), kopfModule.id],
        }),
      ],
    });

    const result = allocate(input, defaultConfig);
    const assignedModuleIds = result.assignments.map((a) => a.moduleId).sort();
    expect(assignedModuleIds).toContain("kopf1");
    expect(result.issues).toEqual([]);
  });

  it("reports rule_violation using the exact solver, not the greedy credit order, when a module spans two exclusive sub-rules", () => {
    // "dual" belongs to both Herz and Pflicht categories, but each is its own
    // exclusive sub-rule — so dual can only ever count toward one of them.
    // Ranked first, creditSubRule's greedy, no-lookahead, order-dependent
    // tie-break (see its comment) locks dual to "Herz" (first sub-rule in the
    // array) purely because it's processed before any other candidate, even
    // though three other pure-Herz modules end up assigned too and could
    // have freed dual for "Pflicht" instead. The old satisfiedSubRuleIds-based
    // report took that greedy credit at face value and flagged a violation
    // that isn't real; the fix re-checks the final assigned set exactly
    // (same solver the admin UI's ruleCompliance.ts uses), which finds the
    // valid assignment and reports none.
    const herz = id<CategoryId>("herz");
    const pflicht = id<CategoryId>("pflicht");
    const kopf = id<CategoryId>("kopf");
    const hand = id<CategoryId>("hand");
    const r = rule("r1", {
      moduleCount: 6,
      subRules: [
        { id: id<SubRuleId>("sr_herz"), categoryIds: [herz] },
        { id: id<SubRuleId>("sr_kopf"), categoryIds: [kopf] },
        { id: id<SubRuleId>("sr_hand"), categoryIds: [hand] },
        { id: id<SubRuleId>("sr_pflicht"), categoryIds: [pflicht] },
      ],
    });
    const dual = module("dual", { max: 30, categoryIds: [herz, pflicht] });
    const herzA = module("herzA", { max: 30, categoryIds: [herz] });
    const herzB = module("herzB", { max: 30, categoryIds: [herz] });
    const herzC = module("herzC", { max: 30, categoryIds: [herz] });
    const kopfModule = module("kopf1", { max: 30, categoryIds: [kopf] });
    const handModule = module("hand1", { max: 30, categoryIds: [hand] });

    const input = baseInput({
      rules: [r],
      modules: [dual, herzA, herzB, herzC, kopfModule, handModule],
      students: [
        student("s1", "r1", {
          preferences: [dual, herzA, herzB, herzC, kopfModule, handModule].map((m, i) => ({
            moduleId: m.id,
            rank: i + 1,
          })),
        }),
      ],
    });

    const result = allocate(input, defaultConfig);
    expect(result.issues).toEqual([]);
  });

  it("orders a student's unranked tail toward a below-min module over one that already meets its min, leaving ranked picks untouched (fillAwareUnrankedOrder defaults to on)", () => {
    const r = rule("r1", { moduleCount: 2 });
    const testStudent = student("s1", "r1", {
      preferences: [{ moduleId: id("chosen"), rank: 1 }],
      eligibleModuleIds: [id("chosen"), id("belowMin"), id("roomy")],
    });
    const input = baseInput({
      rules: [r],
      // nobody ranks belowMin or roomy, so both start the dry run at 0
      // assigned — belowMin's min > 0 puts it below min (deficit 5), while
      // roomy's min 0 already meets it, so belowMin must win the unranked pick.
      modules: [
        module("chosen", { max: 30 }),
        module("belowMin", { min: 5, max: 30 }),
        module("roomy", { min: 0, max: 30 }),
      ],
      students: [testStudent],
    });

    const result = allocate(input, { prioPercent: 0, seed: 5 });

    // ranked pick still wins outright, exactly as without the feature
    expect(result.assignments).toContainEqual({ studentId: id("s1"), moduleId: id("chosen") });
    // unranked tail prefers the module still below its min...
    expect(result.assignments).toContainEqual({ studentId: id("s1"), moduleId: id("belowMin") });
    // ...over one that already meets its (zero) min
    expect(result.assignments).not.toContainEqual({ studentId: id("s1"), moduleId: id("roomy") });
  });

  it("once every module meets its min, orders a student's unranked tail toward the one with the largest fraction of max still free", () => {
    const r = rule("r1", { moduleCount: 1 });
    // 8 contenders fill "small" to 8/10 — it already meets its min (0), just
    // has little relative room left (20% free) — while "big" stays untouched
    // (100% free), so the unranked student should land on "big".
    const contenders = Array.from({ length: 8 }, (_, i) =>
      student(`c${i}`, "r1", { preferences: [{ moduleId: id("small"), rank: 1 }] }),
    );
    const testStudent = student("s1", "r1", {
      preferences: [],
      eligibleModuleIds: [id("small"), id("big")],
    });
    const input = baseInput({
      rules: [r],
      modules: [module("small", { min: 0, max: 10 }), module("big", { min: 0, max: 100 })],
      students: [...contenders, testStudent],
    });

    const result = allocate(input, { prioPercent: 0, seed: 5 });

    expect(result.assignments).toContainEqual({ studentId: id("s1"), moduleId: id("big") });
    expect(result.assignments).not.toContainEqual({ studentId: id("s1"), moduleId: id("small") });
  });

  it("once every module meets its min, ranks by relative empty fraction, not absolute empty seats", () => {
    // X has 20 absolute empty seats (10% of 200) vs. Y's 5 (25% of 20) — more
    // room in X by raw count, but proportionally roomier in Y. Filling both
    // via a priority round first makes their live counts deterministic before
    // s1 (a normal-round, non-priority student) is ever evaluated, so this
    // isn't at the mercy of processing-order interleaving.
    const prio = rule("prio", { moduleCount: 1, priority: true });
    const normal = rule("normal", { moduleCount: 1 });
    const contendersX = Array.from({ length: 180 }, (_, i) =>
      student(`cx${i}`, "prio", { preferences: [{ moduleId: id("X"), rank: 1 }] }),
    );
    const contendersY = Array.from({ length: 15 }, (_, i) =>
      student(`cy${i}`, "prio", { preferences: [{ moduleId: id("Y"), rank: 1 }] }),
    );
    const testStudent = student("s1", "normal", { preferences: [], eligibleModuleIds: [id("X"), id("Y")] });
    const input = baseInput({
      rules: [prio, normal],
      modules: [module("X", { max: 200 }), module("Y", { max: 20 })],
      students: [...contendersX, ...contendersY, testStudent],
    });

    const result = allocate(input, { prioPercent: 1, seed: 5 });

    expect(result.assignments).toContainEqual({ studentId: id("s1"), moduleId: id("Y") });
    expect(result.assignments).not.toContainEqual({ studentId: id("s1"), moduleId: id("X") });
  });

  it("below-min ranking uses absolute predicted deficit, not the deficit relative to each module's own min", () => {
    // A needs 10 more (absolute) to reach its min of 50, just 20% of it —
    // ranked demand covers the rest. B needs all 6 of its min (absolute),
    // i.e. 100% of it, with no ranked demand at all. Absolute ranking (what
    // the engine does) sends most fillers to A; ranking by the *relative*
    // shortfall instead would send them almost all to B.
    const r = rule("r1");
    const A = module("A", { min: 50, max: 100 });
    const B = module("B", { min: 6, max: 50 });
    const contenders = Array.from({ length: 40 }, (_, i) =>
      student(`c${i}`, "r1", { preferences: [{ moduleId: id("A"), rank: 1 }] }),
    );
    const nonVoters = Array.from({ length: 20 }, (_, i) =>
      student(`nv${i}`, "r1", { preferences: [], eligibleModuleIds: [id("A"), id("B")] }),
    );
    const input = baseInput({ rules: [r], modules: [A, B], students: [...contenders, ...nonVoters] });

    const result = allocate(input, { prioPercent: 0, seed: 1 });

    const nonVoterAssignments = result.assignments.filter((a) => a.studentId.startsWith("nv"));
    const toA = nonVoterAssignments.filter((a) => a.moduleId === id("A")).length;
    const toB = nonVoterAssignments.filter((a) => a.moduleId === id("B")).length;
    expect(toA).toBeGreaterThan(toB);
  });

  it("spreads many non-voting students across several equally-below-min modules instead of piling onto one", () => {
    // Regression test: below-min ranking uses the dry run's predicted deficit
    // (an integer, and genuinely tied here since none of these modules gets
    // any ranked demand), so real ties stay ties and the per-pick shuffle can
    // spread students across them — unlike ranking by *live* empty fraction
    // (a continuous value) would, which an earlier version of this feature
    // did for this tier too and which almost never ties two modules exactly,
    // so every student saw the same order and all 40 piled onto one module.
    const r = rule("r1", { moduleCount: 1 });
    const belowMinModules = Array.from({ length: 5 }, (_, i) => module(`bm${i}`, { min: 5, max: 50 }));
    const nonVoters = Array.from({ length: 40 }, (_, i) =>
      student(`nv${i}`, "r1", { preferences: [], eligibleModuleIds: belowMinModules.map((m) => m.id) }),
    );
    const input = baseInput({ rules: [r], modules: belowMinModules, students: nonVoters });

    const result = allocate(input, { prioPercent: 0, seed: 42 });

    const counts = new Map<string, number>();
    for (const a of result.assignments) counts.set(a.moduleId, (counts.get(a.moduleId) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThan(40);
    expect(counts.size).toBeGreaterThan(1);
  });

  it("spreads many non-voting students across several equally-empty at-min modules instead of piling onto one", () => {
    const r = rule("r1", { moduleCount: 1 });
    const roomyModules = Array.from({ length: 5 }, (_, i) => module(`rm${i}`, { min: 0, max: 50 }));
    const nonVoters = Array.from({ length: 40 }, (_, i) =>
      student(`nv${i}`, "r1", { preferences: [], eligibleModuleIds: roomyModules.map((m) => m.id) }),
    );
    const input = baseInput({ rules: [r], modules: roomyModules, students: nonVoters });

    const result = allocate(input, { prioPercent: 0, seed: 7 });

    const counts = new Map<string, number>();
    for (const a of result.assignments) counts.set(a.moduleId, (counts.get(a.moduleId) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThan(40);
    expect(counts.size).toBeGreaterThan(1);
  });

  it("prioritizes a genuinely undersubscribed module over a popular one that ranked demand alone fills to its min", () => {
    // Without the dry run, "unpopular"'s live deficit at the start of the
    // real run is indistinguishable from "popular"'s: both simply equal their
    // own min. Ranking by the dry run's *predicted* deficit instead tells
    // them apart — the dry run shows ranked demand alone fills "popular" to
    // its min (predicted deficit 0), while "unpopular" gets essentially none
    // (predicted deficit close to its min) — so filler seats should go
    // almost entirely to "unpopular".
    const r = rule("r1", { moduleCount: 1 });
    const popular = module("popular", { min: 20, max: 20 });
    const unpopular = module("unpopular", { min: 8, max: 50 });
    // distractor modules spread the dry run's random filler pass thin, so
    // "unpopular" doesn't accidentally hit its min by sheer luck of a 50/50 split
    const distractors = Array.from({ length: 8 }, (_, i) => module(`d${i}`, { min: 0, max: 50 }));
    const contenders = Array.from({ length: 20 }, (_, i) =>
      student(`c${i}`, "r1", { preferences: [{ moduleId: id("popular"), rank: 1 }] }),
    );
    const fillerEligible = [id<ModuleId>("popular"), id<ModuleId>("unpopular"), ...distractors.map((m) => m.id)];
    const nonVoters = Array.from({ length: 10 }, (_, i) =>
      student(`nv${i}`, "r1", { preferences: [], eligibleModuleIds: fillerEligible }),
    );
    const input = baseInput({
      rules: [r],
      modules: [popular, unpopular, ...distractors],
      students: [...contenders, ...nonVoters],
    });

    const result = allocate(input, { prioPercent: 0, seed: 3 });

    const nonVoterAssignments = result.assignments.filter((a) => a.studentId.startsWith("nv"));
    const toUnpopular = nonVoterAssignments.filter((a) => a.moduleId === id("unpopular")).length;
    const toPopular = nonVoterAssignments.filter((a) => a.moduleId === id("popular")).length;
    expect(toUnpopular).toBeGreaterThan(toPopular);
  });

  it("fillAwareUnrankedOrder: false falls back to plain per-student randomization of the unranked tail", () => {
    const r = rule("r1", { moduleCount: 1 });
    const testStudent = student("s1", "r1", {
      preferences: [],
      eligibleModuleIds: [id("belowMin"), id("roomy")],
    });
    const input = baseInput({
      rules: [r],
      modules: [module("belowMin", { min: 5, max: 30 }), module("roomy", { min: 0, max: 30 })],
      students: [testStudent],
    });

    // With fill-aware ordering off, s1's unranked tail is pure random per
    // seed — across a fixed spread of seeds it must land on both modules at
    // least once, unlike the "on" case above where it would always pick
    // belowMin.
    const outcomes = new Set(
      Array.from({ length: 30 }, (_, seed) =>
        allocate(input, { prioPercent: 0, seed, fillAwareUnrankedOrder: false }).assignments.find(
          (a) => a.studentId === id("s1"),
        )?.moduleId,
      ),
    );
    expect(outcomes).toContain(id("belowMin"));
    expect(outcomes).toContain(id("roomy"));
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

describe("allocate — pinned modules", () => {
  it("assigns a pinned module ignoring capacity, even when it's already full", () => {
    const r = rule("r1", { moduleCount: 1 });
    const input = baseInput({
      rules: [r],
      modules: [module("m1", { max: 1 })],
      students: [
        student("s1", "r1", { pinnedModuleIds: [id("m1")] }),
        student("s2", "r1", { pinnedModuleIds: [id("m1")] }),
      ],
    });

    const result = allocate(input, defaultConfig);
    expect(result.assignments).toContainEqual({ studentId: id("s1"), moduleId: id("m1") });
    expect(result.assignments).toContainEqual({ studentId: id("s2"), moduleId: id("m1") });
    expect(result.issues).toEqual([]);
  });

  it("satisfies a sub-rule via a pinned module the student never ranked", () => {
    const sport: CategoryId = id("sport");
    const r = rule("r1", {
      moduleCount: 1,
      subRules: [{ id: id<SubRuleId>("sub1"), categoryIds: [sport] }],
    });
    const input = baseInput({
      rules: [r],
      modules: [module("bouldern", { max: 5, categoryIds: [sport] })],
      students: [student("s1", "r1", { pinnedModuleIds: [id("bouldern")] })],
    });

    const result = allocate(input, defaultConfig);
    expect(result.assignments).toEqual([{ studentId: id("s1"), moduleId: id("bouldern") }]);
    expect(result.issues).toEqual([]);
  });

  it("assigns two pinned modules on the same day despite the schedule overlap between them", () => {
    const r = rule("r1", { moduleCount: 2 });
    const input = baseInput({
      rules: [r],
      modules: [
        module("m1", { max: 5, dateIds: [id("monday")] }),
        module("m2", { max: 5, dateIds: [id("monday")] }),
      ],
      students: [student("s1", "r1", { pinnedModuleIds: [id("m1"), id("m2")] })],
    });

    const result = allocate(input, defaultConfig);
    const assignedModuleIds = result.assignments.map((a) => a.moduleId).sort();
    expect(assignedModuleIds).toEqual(["m1", "m2"]);
  });

  it("blocks a further, non-pinned module on the same day as a pinned one", () => {
    const r = rule("r1", { moduleCount: 2 });
    const input = baseInput({
      rules: [r],
      modules: [
        module("pinned", { max: 5, dateIds: [id("monday")] }),
        module("ranked", { max: 5, dateIds: [id("monday")] }),
      ],
      students: [
        student("s1", "r1", {
          pinnedModuleIds: [id("pinned")],
          preferences: [{ moduleId: id("ranked"), rank: 1 }],
          eligibleModuleIds: [id("ranked")],
        }),
      ],
    });

    const result = allocate(input, defaultConfig);
    expect(result.assignments).toEqual([{ studentId: id("s1"), moduleId: id("pinned") }]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: "unassigned", studentId: id("s1") }),
    );
  });

  it("a pin alone can already satisfy moduleCount, so no unassigned issue is raised", () => {
    const r = rule("r1", { moduleCount: 1 });
    const input = baseInput({
      rules: [r],
      modules: [module("m1", { max: 5 })],
      students: [student("s1", "r1", { pinnedModuleIds: [id("m1")] })],
    });

    const result = allocate(input, defaultConfig);
    expect(result.assignments).toEqual([{ studentId: id("s1"), moduleId: id("m1") }]);
    expect(result.issues).toEqual([]);
  });

  it("keeps a pinned module's actual preference rank instead of reporting it as unranked", () => {
    const r = rule("r1", { moduleCount: 1 });
    const input = baseInput({
      rules: [r],
      modules: [module("m1", { max: 5 })],
      students: [
        student("s1", "r1", {
          pinnedModuleIds: [id("m1")],
          preferences: [{ moduleId: id("m1"), rank: 1 }],
          eligibleModuleIds: [id("m1")],
        }),
      ],
    });

    const result = allocate(input, defaultConfig);
    expect(result.assignments).toEqual([{ studentId: id("s1"), moduleId: id("m1") }]);
    // Rank 1, not bucket 0 (unranked/filler) — the student's stated top
    // preference happens to be the same module that was also pinned.
    expect(result.metrics.preferenceDistribution[1]).toBe(1);
    expect(result.metrics.preferenceDistribution[0]).toBeUndefined();
    expect(result.metrics.score).toBe(100);
  });

  it("stays correct and completes promptly when a student is pinned far more modules than their rule's moduleCount", () => {
    // Regression guard for evaluateRuleFulfillment's exact backtracking
    // search, which historically assumed a student's assigned-module count
    // was bounded by rule.moduleCount — pins break that bound, so this
    // exercises a candidate count an admin could plausibly produce by
    // over-pinning, via the real allocate() -> evaluateRuleFulfillment path.
    const sport: CategoryId = id("sport");
    const r = rule("r1", {
      moduleCount: 1,
      subRules: [{ id: id<SubRuleId>("sub1"), categoryIds: [sport] }],
    });
    const pinnedModuleIds = Array.from({ length: 16 }, (_, i) => id<ModuleId>(`m${i}`));
    const modules = pinnedModuleIds.map((moduleId, i) =>
      module(moduleId, { max: 5, categoryIds: i === 0 ? [sport] : [] }),
    );
    const input = baseInput({
      rules: [r],
      modules,
      students: [student("s1", "r1", { pinnedModuleIds })],
    });

    const result = allocate(input, defaultConfig);
    expect(result.assignments.map((a) => a.moduleId).sort()).toEqual([...pinnedModuleIds].sort());
    expect(result.issues).toEqual([]);
  });

  it("prio-round capacity reservation accounts for capacity already used by pins", () => {
    const prioRule = rule("prio", { moduleCount: 1, priority: true });
    const input = baseInput({
      rules: [prioRule],
      // max: 2, fully used up by two pins before the prio round even starts —
      // without subtracting assignedTotal, reserving ceil(1 * 2) = 2 seats
      // here would let a third student in over capacity.
      modules: [module("m1", { max: 2 })],
      students: [
        student("pinned1", "prio", { pinnedModuleIds: [id("m1")] }),
        student("pinned2", "prio", { pinnedModuleIds: [id("m1")] }),
        student("prioStudent", "prio", { preferences: [{ moduleId: id("m1"), rank: 1 }] }),
      ],
    });

    const result = allocate(input, { prioPercent: 1, seed: 7 });
    expect(result.assignments.filter((a) => a.moduleId === id("m1"))).toHaveLength(2);
    expect(result.assignments).not.toContainEqual({ studentId: id("prioStudent"), moduleId: id("m1") });
  });
});
