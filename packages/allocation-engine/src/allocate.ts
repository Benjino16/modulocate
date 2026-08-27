import { createRng } from "./rng";
import { evaluateRuleFulfillment } from "./evaluateRule";
import type {
  AllocationConfig,
  AllocationInput,
  AllocationIssue,
  AllocationModule,
  AllocationModuleDemand,
  AllocationResult,
  AllocationRule,
  AllocationStudent,
  AllocationSubRule,
  CategoryId,
  ModuleId,
  StudentId,
  SubRuleId,
} from "./types";

// Geometric decay used for AllocationMetrics.score: rank 1 = 100, rank 2 = 70,
// rank 3 = 49, ... — rank 1 vs 2 matters far more than rank 5 vs 6, which a
// linear rank-sum would not reflect. See allocator_planning.md discussion.
const PREFERENCE_RANK_DECAY = 0.7;

interface ModuleRuntime {
  module: AllocationModule;
  // reset at the start of each round (prio capacity, then released remainder)
  remainingCapacityThisRound: number;
  // cumulative across both rounds — used for the final below_min_capacity check
  // and to compute round-2 capacity (max - actually used prio slots)
  assignedTotal: number;
}

interface StudentRuntime {
  student: AllocationStudent;
  rule: AllocationRule;
  // eligibleModuleIds minus ranked ones. Unordered here — buildWindow orders
  // this fresh on every call (see orderByFillPriorityThenShuffle/shuffle
  // there) since the live fill state it ranks by changes as the run
  // progresses; no module is systematically favored among students who
  // didn't rank it either way.
  unrankedCandidates: ModuleId[];
  assignedModuleIds: ModuleId[];
  assignedModuleIdSet: Set<ModuleId>;
  assignedRankByModuleId: Map<ModuleId, number | undefined>;
  // sub-rule set-cover bookkeeping: categories of `subRule.categoryIds` already
  // covered by a module claimed for that sub-rule (exclusivity: a module can be
  // claimed by at most one sub-rule, tracked separately, see claimedModuleIds)
  subRuleCoverage: Map<SubRuleId, Set<CategoryId>>;
  satisfiedSubRuleIds: Set<SubRuleId>;
  claimedModuleIds: Set<ModuleId>;
}

// Fisher-Yates using the run's seeded rng, so the shuffled order is
// reproducible for a given AllocationConfig.seed.
function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

interface ModuleFillPriority {
  // Not yet at its (real, live) min: fill these first, highest predicted
  // deficit first. Once a module's live assignedTotal reaches its min,
  // switch to filling whichever has the largest fraction of its max still
  // free right now — proportional balancing rather than raw remaining seats,
  // so a small and a large module needing the same relative top-up are
  // treated alike.
  meetsMin: boolean;
  // Ascending sort key within the meetsMin group: -predictedDeficit while
  // below min, -liveEmptyFraction once at/above min (most relatively empty
  // sorts first).
  score: number;
}

// Runs a full dry allocation (fillAwareUnrankedOrder forced off — a dry run
// has nothing to predict against yet, and forcing it off is what stops this
// from recursing) purely to read each module's naturally-reached assigned
// count, then derives from it how far short of min the module would still be
// under natural demand alone (ranked preferences plus a plain random filler
// pass) — see orderByFillPriorityThenShuffle for why this, and not the
// module's raw min, is what the below-min tier should rank by.
function computeModulePredictedDeficit(input: AllocationInput, config: AllocationConfig): Map<ModuleId, number> {
  const dryRun = allocate(input, { ...config, fillAwareUnrankedOrder: false });
  const dryAssignedCount = new Map<ModuleId, number>(input.modules.map((m) => [m.id, 0]));
  for (const a of dryRun.assignments) {
    dryAssignedCount.set(a.moduleId, (dryAssignedCount.get(a.moduleId) ?? 0) + 1);
  }
  return new Map(input.modules.map((m) => [m.id, Math.max(0, m.min - (dryAssignedCount.get(m.id) ?? 0))]));
}

// Below-min modules first (highest *predicted* deficit first — see
// computeModulePredictedDeficit), then at/above-min modules (most relatively
// empty *right now* first).
//
// Tier membership (meetsMin) is always evaluated against the real run's live
// assignedTotal, never the dry run: that's what guarantees a module is never
// targeted past its actual min and always graduates out once actually
// reached, regardless of what the dry run predicted.
//
// The below-min tier is *ranked* by the dry run's predicted deficit rather
// than the module's raw min, because at the start of a real run every
// below-min module's live deficit simply equals its min — indistinguishable
// from a big, genuinely popular module (which ranked demand alone would fill
// anyway) and a small, genuinely undersubscribed one. The dry run tells them
// apart.
//
// The at/above-min tier is ranked by *live* empty fraction, re-evaluated on
// every call: a fixed snapshot (dry-run or otherwise) rarely ties two modules
// *exactly*, even when they're genuinely equivalent (nobody assigned to
// either yet) — sampling noise alone nudges their counts apart — so every
// student would see the same, effectively deterministic order and pile onto
// one module. Recomputing against the real run's current counts each time
// keeps genuinely-tied modules tied (and hands them to the shuffle below),
// while causing a module's own score to visibly worsen the moment it gets a
// pick, which naturally rotates the next pick elsewhere.
function orderByFillPriorityThenShuffle(
  items: ModuleId[],
  moduleById: Map<ModuleId, AllocationModule>,
  moduleRuntimes: Map<ModuleId, ModuleRuntime>,
  predictedDeficitByModuleId: Map<ModuleId, number>,
  rng: () => number,
): ModuleId[] {
  function priority(id: ModuleId): ModuleFillPriority {
    const module = moduleById.get(id)!;
    const assignedTotal = moduleRuntimes.get(id)!.assignedTotal;
    if (assignedTotal < module.min) {
      return { meetsMin: false, score: -(predictedDeficitByModuleId.get(id) ?? 0) };
    }
    const emptyFraction = module.max > 0 ? (module.max - assignedTotal) / module.max : 0;
    return { meetsMin: true, score: -emptyFraction };
  }
  return shuffle(items, rng).sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa.meetsMin !== pb.meetsMin) return pa.meetsMin ? 1 : -1;
    return pa.score - pb.score;
  });
}

export function allocate(input: AllocationInput, config: AllocationConfig): AllocationResult {
  const rng = createRng(config.seed);
  const fillAwareUnrankedOrder = config.fillAwareUnrankedOrder ?? true;
  const predictedDeficitByModuleId = fillAwareUnrankedOrder ? computeModulePredictedDeficit(input, config) : undefined;
  const moduleById = new Map<ModuleId, AllocationModule>(input.modules.map((m) => [m.id, m]));
  const ruleById = new Map<string, AllocationRule>(input.rules.map((r) => [r.id, r]));

  const moduleRuntimes = new Map<ModuleId, ModuleRuntime>(
    input.modules.map((m) => [m.id, { module: m, remainingCapacityThisRound: 0, assignedTotal: 0 }]),
  );
  // Seeded with every module up front (see AllocationMetrics.moduleDemand's
  // comment) so lookups below never need a presence check.
  const moduleDemand = new Map<ModuleId, AllocationModuleDemand>(
    input.modules.map((m) => [m.id, { rejections: 0, rejectionsViaRuleRequirement: 0 }]),
  );

  const studentStates = new Map<StudentId, StudentRuntime>();
  for (const student of input.students) {
    const rule = ruleById.get(student.ruleId);
    if (!rule) {
      // Contract violation by the caller (worker) — see AllocationStudent.ruleId's
      // comment: every student must resolve to a rule before reaching the engine.
      throw new Error(`AllocationStudent ${student.id} references unresolved rule ${student.ruleId}`);
    }
    const rankedSet = new Set(student.preferences.map((p) => p.moduleId));
    const unrankedCandidates = student.eligibleModuleIds.filter((id) => !rankedSet.has(id));
    studentStates.set(student.id, {
      student,
      rule,
      unrankedCandidates,
      assignedModuleIds: [],
      assignedModuleIdSet: new Set(),
      assignedRankByModuleId: new Map(),
      subRuleCoverage: new Map(),
      satisfiedSubRuleIds: new Set(),
      claimedModuleIds: new Set(),
    });
  }

  // Pinned modules are guaranteed before either round runs: seeded directly
  // into assignedModuleIds/assignedModuleIdSet and assignedTotal, entirely
  // bypassing buildWindow — so no capacity, blocked-category/date, or
  // schedule-overlap check ever applies to the pin itself, and two pins on
  // the same day both survive. assignedRankByModuleId is still populated from
  // the student's own preferences here (same lookup as assignModule) so a
  // module that happens to be both pinned and independently ranked isn't
  // misreported as an unranked/filler pick in preferenceDistribution/score —
  // a pin with no matching preference correctly ends up unranked either way.
  // creditSubRule runs so a pin can already satisfy a sub-rule (e.g. "1x
  // Sport") before the student is ever considered in a round. From here on,
  // every existing filter (buildWindow's date-overlap check via
  // assignedDateIds, the sub-rule "still open" check, capacity accounting)
  // transparently treats a pinned module as already-assigned, with no
  // per-filter special-casing needed.
  for (const state of studentStates.values()) {
    for (const moduleId of state.student.pinnedModuleIds) {
      if (state.assignedModuleIdSet.has(moduleId)) continue;
      const module = moduleById.get(moduleId);
      if (!module) continue; // stale reference — the caller's responsibility to avoid
      state.assignedModuleIds.push(moduleId);
      state.assignedModuleIdSet.add(moduleId);
      const preference = state.student.preferences.find((p) => p.moduleId === moduleId);
      state.assignedRankByModuleId.set(moduleId, preference?.rank);
      moduleRuntimes.get(moduleId)!.assignedTotal += 1;
      creditSubRule(state, module);
    }
  }

  function assignedDateIds(state: StudentRuntime): Set<string> {
    const dateIds = new Set<string>();
    for (const moduleId of state.assignedModuleIds) {
      for (const dateId of moduleById.get(moduleId)!.dateIds) dateIds.add(dateId);
    }
    return dateIds;
  }

  function moduleHelpsOpenSubRule(state: StudentRuntime, module: AllocationModule): boolean {
    const categorySet = new Set(module.categoryIds);
    return state.rule.subRules.some((subRule) => {
      if (state.satisfiedSubRuleIds.has(subRule.id)) return false;
      const covered = state.subRuleCoverage.get(subRule.id);
      return subRule.categoryIds.some((categoryId) => categorySet.has(categoryId) && !covered?.has(categoryId));
    });
  }

  // Credits a demand-rejection to `moduleId`: `state` wanted it (by rank or
  // eligibility) at this decision point but it had no capacity left this
  // round. Called from both buildWindow (round 2, where full candidates are
  // filtered out before the caller ever sees them) and runRound's picking
  // loop (round 1, where they're skipped over inline) — see each call site.
  function recordRejection(state: StudentRuntime, moduleId: ModuleId): void {
    const demand = moduleDemand.get(moduleId)!;
    demand.rejections += 1;
    if (moduleHelpsOpenSubRule(state, moduleById.get(moduleId)!)) demand.rejectionsViaRuleRequirement += 1;
  }

  // Greedy best-fit: credits the module to whichever open sub-rule it covers
  // the most new categories for, then marks the sub-rule satisfied once fully
  // covered. Consistent with the rest of the algorithm being greedy/no-lookahead
  // (planning.md "Locked Decision: Allocation Rule Model").
  function creditSubRule(state: StudentRuntime, module: AllocationModule): void {
    const categorySet = new Set(module.categoryIds);
    let bestSubRule: AllocationSubRule | undefined;
    let bestNewlyCoveredCount = 0;
    for (const subRule of state.rule.subRules) {
      if (state.satisfiedSubRuleIds.has(subRule.id)) continue;
      const covered = state.subRuleCoverage.get(subRule.id);
      const newlyCovered = subRule.categoryIds.filter((c) => categorySet.has(c) && !covered?.has(c));
      if (newlyCovered.length > bestNewlyCoveredCount) {
        bestNewlyCoveredCount = newlyCovered.length;
        bestSubRule = subRule;
      }
    }
    if (!bestSubRule) return;

    const covered = state.subRuleCoverage.get(bestSubRule.id) ?? new Set<CategoryId>();
    for (const categoryId of bestSubRule.categoryIds) {
      if (categorySet.has(categoryId)) covered.add(categoryId);
    }
    state.subRuleCoverage.set(bestSubRule.id, covered);
    state.claimedModuleIds.add(module.id);
    if (bestSubRule.categoryIds.every((c) => covered.has(c))) {
      state.satisfiedSubRuleIds.add(bestSubRule.id);
    }
  }

  function buildWindow(state: StudentRuntime, isPrioRound: boolean): ModuleId[] {
    const rankedIds = [...state.student.preferences].sort((a, b) => a.rank - b.rank).map((p) => p.moduleId);
    // Eligible-but-unranked modules are lowest priority (planning.md "Locked
    // Decision: Live Resolution..." module-add mechanics) — appended after all
    // ranked ones so they can never displace an actively-ranked module, and
    // ordered fresh against live fill state each call (see
    // orderByFillPriorityThenShuffle) rather than id-sorted, so no module is
    // systematically favored among students who didn't rank it.
    const unrankedIds = fillAwareUnrankedOrder
      ? orderByFillPriorityThenShuffle(state.unrankedCandidates, moduleById, moduleRuntimes, predictedDeficitByModuleId!, rng)
      : shuffle(state.unrankedCandidates, rng);
    const dates = assignedDateIds(state);
    let list = [...rankedIds, ...unrankedIds].filter((id) => {
      if (state.assignedModuleIdSet.has(id)) return false; // never re-assign the same module
      const module = moduleById.get(id);
      if (!module) return false;
      return !module.dateIds.some((d) => dates.has(d));
    });

    if (!isPrioRound) {
      // Capacity is filtered here (not left to the picking loop, unlike the
      // prio round below) so the ruleSatisfying subset further down only
      // ever considers currently-available modules. Record a rejection for
      // every full candidate in rank order up to the first available one —
      // anything after that point was never "in the running" this turn, so
      // counting it would attribute demand this student never actually felt.
      for (const id of list) {
        if ((moduleRuntimes.get(id)?.remainingCapacityThisRound ?? 0) > 0) break;
        recordRejection(state, id);
      }
      list = list.filter((id) => (moduleRuntimes.get(id)?.remainingCapacityThisRound ?? 0) > 0);
    }

    if (state.satisfiedSubRuleIds.size < state.rule.subRules.length) {
      const ruleSatisfying = list.filter((id) => moduleHelpsOpenSubRule(state, moduleById.get(id)!));
      if (ruleSatisfying.length > 0) list = ruleSatisfying;
    }

    // Window-size cap applied last (prio round only): an unranked module that
    // is the only way to satisfy a still-open sub-rule must survive the
    // ruleSatisfying filter above before this trims the list down — capping
    // by rank position first (as this used to) could discard it in favor of
    // lower-priority ranked modules that don't help any open sub-rule.
    if (isPrioRound) {
      const stillNeeded = state.rule.moduleCount - state.assignedModuleIds.length;
      list = list.slice(0, Math.max(stillNeeded, 0));
    }

    return list;
  }

  function pickNeediest(activeStates: StudentRuntime[]): StudentRuntime | undefined {
    if (activeStates.length === 0) return undefined;
    const minAssigned = Math.min(...activeStates.map((s) => s.assignedModuleIds.length));
    const fewestAssigned = activeStates.filter((s) => s.assignedModuleIds.length === minAssigned);
    const minSatisfied = Math.min(...fewestAssigned.map((s) => s.satisfiedSubRuleIds.size));
    const fewestSatisfied = fewestAssigned.filter((s) => s.satisfiedSubRuleIds.size === minSatisfied);
    return fewestSatisfied[Math.floor(rng() * fewestSatisfied.length)];
  }

  function assignModule(state: StudentRuntime, moduleId: ModuleId): void {
    const runtime = moduleRuntimes.get(moduleId)!;
    runtime.remainingCapacityThisRound -= 1;
    runtime.assignedTotal += 1;
    state.assignedModuleIds.push(moduleId);
    state.assignedModuleIdSet.add(moduleId);
    const preference = state.student.preferences.find((p) => p.moduleId === moduleId);
    state.assignedRankByModuleId.set(moduleId, preference?.rank);
    creditSubRule(state, moduleById.get(moduleId)!);
  }

  function runRound(participantIds: StudentId[], isPrioRound: boolean): void {
    const stalled = new Set<StudentId>();
    for (;;) {
      const active = participantIds
        .map((id) => studentStates.get(id)!)
        .filter((s) => s.assignedModuleIds.length < s.rule.moduleCount && !stalled.has(s.student.id));
      const next = pickNeediest(active);
      if (!next) break;

      const window = buildWindow(next, isPrioRound);
      // Same intent as buildWindow's round-2 capacity filter above, just
      // inline here instead: this round doesn't pre-filter capacity into
      // buildWindow (see its `isPrioRound` branch), so the skipped-over
      // candidates are only ever visible at this point.
      let chosenId: ModuleId | undefined;
      for (const id of window) {
        if ((moduleRuntimes.get(id)?.remainingCapacityThisRound ?? 0) > 0) {
          chosenId = id;
          break;
        }
        recordRejection(next, id);
      }
      if (chosenId === undefined) {
        // No capacity anywhere in this student's window this round — every other
        // student's assignment this round only consumes capacity, never frees it
        // for this student, so retrying later in the *same* round cannot help.
        // Reconsidered in the next round (allocator_planning.md Section 2, step 4).
        stalled.add(next.student.id);
        continue;
      }
      assignModule(next, chosenId);
    }
  }

  // Phase 1: prio round — reserved capacity, priority-rule students only.
  // Subtracts assignedTotal (only ever >0 here because of pins seeded above)
  // so a module already filled/over-filled by pins doesn't also reserve
  // fresh prio-round capacity on top of that.
  for (const module of input.modules) {
    const runtime = moduleRuntimes.get(module.id)!;
    runtime.remainingCapacityThisRound = Math.max(0, Math.ceil(config.prioPercent * module.max) - runtime.assignedTotal);
  }
  const prioStudentIds = input.students.filter((s) => studentStates.get(s.id)!.rule.priority).map((s) => s.id);
  runRound(prioStudentIds, true);

  // Release unused reserved capacity back to the pool for the normal round.
  for (const module of input.modules) {
    const runtime = moduleRuntimes.get(module.id)!;
    runtime.remainingCapacityThisRound = module.max - runtime.assignedTotal;
  }

  // Phase 2: normal round — everyone still short of their target, no special treatment.
  runRound(
    input.students.map((s) => s.id),
    false,
  );

  // --- Build result ---
  const issues: AllocationIssue[] = [];
  const preferenceDistribution: Record<number, number> = {};
  let totalWeight = 0;
  let totalAssignments = 0;
  const assignments = [];

  for (const state of studentStates.values()) {
    for (const moduleId of state.assignedModuleIds) {
      assignments.push({ studentId: state.student.id, moduleId });
      const rank = state.assignedRankByModuleId.get(moduleId);
      const bucket = rank ?? 0;
      preferenceDistribution[bucket] = (preferenceDistribution[bucket] ?? 0) + 1;
      totalAssignments += 1;
      totalWeight += rank ? 100 * Math.pow(PREFERENCE_RANK_DECAY, rank - 1) : 0;
    }
    if (state.assignedModuleIds.length < state.rule.moduleCount) {
      issues.push({
        type: "unassigned",
        studentId: state.student.id,
        detail: `${state.assignedModuleIds.length} von ${state.rule.moduleCount} Modulen zugewiesen`,
      });
    }
    // Re-checked exactly here rather than trusting state.satisfiedSubRuleIds:
    // creditSubRule is a greedy, no-lookahead, order-dependent heuristic (see
    // its comment) — it can lock a multi-category module (one whose
    // categories span two different sub-rules) to whichever sub-rule it
    // happens to reach first, even when a different credit assignment over
    // the same final module set would have satisfied every sub-rule. Running
    // the exact solver once per student here (small, fixed input — bounded by
    // moduleCount and subRules.length, both typically single digits) reports
    // what's actually true of the final assignment instead of an artifact of
    // greedy processing order, and keeps this in sync with evaluateRuleFulfillment's
    // other caller, the admin review UI (ruleCompliance.ts).
    const assignedModules = state.assignedModuleIds.map((moduleId) => moduleById.get(moduleId)!);
    const evaluation = evaluateRuleFulfillment(assignedModules, state.rule);
    const unsatisfiedSubRuleCount = evaluation.subRules.filter((subRule) => !subRule.satisfied).length;
    if (unsatisfiedSubRuleCount > 0) {
      issues.push({
        type: "rule_violation",
        studentId: state.student.id,
        detail: `${unsatisfiedSubRuleCount} von ${state.rule.subRules.length} Teilregeln nicht erfüllt`,
      });
    }
  }

  for (const runtime of moduleRuntimes.values()) {
    if (runtime.assignedTotal > 0 && runtime.assignedTotal < runtime.module.min) {
      issues.push({
        type: "below_min_capacity",
        moduleId: runtime.module.id,
        detail: `${runtime.assignedTotal} von min. ${runtime.module.min} belegt`,
      });
    }
  }

  const moduleDemandRecord: Record<ModuleId, AllocationModuleDemand> = {};
  for (const [moduleId, demand] of moduleDemand) {
    moduleDemandRecord[moduleId] = demand;
  }

  return {
    assignments,
    issues,
    metrics: {
      score: totalAssignments > 0 ? totalWeight / totalAssignments : 0,
      unassignedCount: issues.filter((i) => i.type === "unassigned").length,
      ruleViolationCount: issues.filter((i) => i.type === "rule_violation").length,
      preferenceDistribution,
      moduleDemand: moduleDemandRecord,
    },
  };
}
