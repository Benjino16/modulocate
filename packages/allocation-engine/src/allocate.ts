import { createRng } from "./rng";
import type {
  AllocationConfig,
  AllocationInput,
  AllocationIssue,
  AllocationModule,
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

export function allocate(input: AllocationInput, config: AllocationConfig): AllocationResult {
  const rng = createRng(config.seed);
  const moduleById = new Map<ModuleId, AllocationModule>(input.modules.map((m) => [m.id, m]));
  const ruleById = new Map<string, AllocationRule>(input.rules.map((r) => [r.id, r]));

  const moduleRuntimes = new Map<ModuleId, ModuleRuntime>(
    input.modules.map((m) => [m.id, { module: m, remainingCapacityThisRound: 0, assignedTotal: 0 }]),
  );

  const studentStates = new Map<StudentId, StudentRuntime>();
  for (const student of input.students) {
    const rule = ruleById.get(student.ruleId);
    if (!rule) {
      // Contract violation by the caller (worker) — see AllocationStudent.ruleId's
      // comment: every student must resolve to a rule before reaching the engine.
      throw new Error(`AllocationStudent ${student.id} references unresolved rule ${student.ruleId}`);
    }
    studentStates.set(student.id, {
      student,
      rule,
      assignedModuleIds: [],
      assignedModuleIdSet: new Set(),
      assignedRankByModuleId: new Map(),
      subRuleCoverage: new Map(),
      satisfiedSubRuleIds: new Set(),
      claimedModuleIds: new Set(),
    });
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
    const rankedSet = new Set(rankedIds);
    // Eligible-but-unranked modules are lowest priority (planning.md "Locked
    // Decision: Live Resolution..." module-add mechanics) — appended after all
    // ranked ones so they can never displace an actively-ranked module, and
    // sorted by id for a deterministic order among themselves.
    const unrankedIds = state.student.eligibleModuleIds.filter((id) => !rankedSet.has(id)).sort();

    const dates = assignedDateIds(state);
    let list = [...rankedIds, ...unrankedIds].filter((id) => {
      if (state.assignedModuleIdSet.has(id)) return false; // never re-assign the same module
      const module = moduleById.get(id);
      if (!module) return false;
      return !module.dateIds.some((d) => dates.has(d));
    });

    if (!isPrioRound) {
      list = list.filter((id) => (moduleRuntimes.get(id)?.remainingCapacityThisRound ?? 0) > 0);
    } else {
      const stillNeeded = state.rule.moduleCount - state.assignedModuleIds.length;
      list = list.slice(0, Math.max(stillNeeded, 0));
    }

    if (state.satisfiedSubRuleIds.size < state.rule.subRules.length) {
      const ruleSatisfying = list.filter((id) => moduleHelpsOpenSubRule(state, moduleById.get(id)!));
      if (ruleSatisfying.length > 0) return ruleSatisfying;
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
      const chosenId = window.find((id) => (moduleRuntimes.get(id)?.remainingCapacityThisRound ?? 0) > 0);
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
  for (const module of input.modules) {
    moduleRuntimes.get(module.id)!.remainingCapacityThisRound = Math.ceil(config.prioPercent * module.max);
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
    if (state.satisfiedSubRuleIds.size < state.rule.subRules.length) {
      issues.push({
        type: "rule_violation",
        studentId: state.student.id,
        detail: `${state.rule.subRules.length - state.satisfiedSubRuleIds.size} von ${state.rule.subRules.length} Teilregeln nicht erfüllt`,
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

  return {
    assignments,
    issues,
    metrics: {
      score: totalAssignments > 0 ? totalWeight / totalAssignments : 0,
      unassignedCount: issues.filter((i) => i.type === "unassigned").length,
      ruleViolationCount: issues.filter((i) => i.type === "rule_violation").length,
      preferenceDistribution,
    },
  };
}
