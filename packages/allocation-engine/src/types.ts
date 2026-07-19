// --- IDs ---
export type StudentId = string & { readonly __brand: "StudentId" };
export type ModuleId = string & { readonly __brand: "ModuleId" };
export type CategoryId = string & { readonly __brand: "CategoryId" };
export type GroupId = string & { readonly __brand: "GroupId" };
export type RuleId = string & { readonly __brand: "RuleId" };
export type SubRuleId = string & { readonly __brand: "SubRuleId" };
export type DateId = string & { readonly __brand: "DateId" };

// --- Module ---
export interface AllocationModule {
  id: ModuleId;
  min: number;
  max: number;
  categoryIds: CategoryId[]; // resolved, includes category_includes_category composition
  dateIds: DateId[]; // resolved module -> dates, used for scheduling-conflict detection
}

// --- Category ---
// category_includes_category composition is already resolved into module.categoryIds
export interface AllocationCategory {
  id: CategoryId;
}

// --- Group ---
// Informational only (reporting/fairness aggregation) — blocking/rules are already
// resolved per student, so groups carry no decision logic here.
export interface AllocationGroup {
  id: GroupId;
  studentIds: StudentId[];
}

// --- Rule ---
// A rule consists of any number of sub-rules. Categories within the same sub-rule are
// NOT distinct from each other — a single module that is a member of all of them satisfies
// the sub-rule alone. If no such module exists among the assigned ones, multiple modules
// are needed whose combined category membership covers the sub-rule (set-cover).
// Each assigned module may satisfy at most one sub-rule of a rule — this exclusivity is
// what makes sub-rules distinct from one another, without needing a separate flag/grouping
// concept (and without the transitivity ambiguity that concept would introduce).
// "2x Sport" is expressed as two separate sub-rules each containing just {Sport}, not via
// a count field — exclusivity then forces two distinct Sport modules.
export interface AllocationSubRule {
  id: SubRuleId;
  categoryIds: CategoryId[];
}

// Blocking (rule_blocked_category/module/date in the DB) is deliberately NOT
// represented here — it's resolved once per student by the worker's translation
// layer, before the allocator ever sees an AllocationInput, same as eligibleModuleIds
// below. Sub-rules are the one exception kept raw: their exclusivity ("a module may
// satisfy at most one sub-rule") depends on which modules end up assigned together,
// so it can't be flattened into a static per-student list ahead of time.
export interface AllocationRule {
  id: RuleId;
  // how many modules a student under this rule should end up with — the
  // algorithm's target count per student, and (in the prio round) the window
  // size N. Every AllocationStudent must resolve to a rule that has this set;
  // there is no engine-side fallback for an unresolved rule (see AllocationStudent.ruleId).
  moduleCount: number;
  // whether students under this rule participate in the reserved-capacity
  // prio round (allocator_planning.md Section 4) before the normal round.
  priority: boolean;
  subRules: AllocationSubRule[];
}

// --- Student ---
export interface AllocationPreference {
  moduleId: ModuleId;
  rank: number; // 1 = most preferred
}

export interface AllocationStudent {
  id: StudentId;
  groupIds: GroupId[];
  // resolved: student.rule_id overrides group.rule_id. Non-null by contract —
  // every student handed to the engine must have an effective rule (moduleCount
  // is meaningless otherwise); resolving/enforcing a project default when
  // neither student nor group specifies one is the caller's (worker's)
  // responsibility, not the engine's. Assembling an AllocationInput with an
  // unresolved student should fail before the engine ever runs.
  ruleId: RuleId;
  preferences: AllocationPreference[]; // only modules the student was allowed to see
  // resolved: modules not excluded by the effective rule's blocked category/module/date
  // (composition-resolved). A blocked date has no separate representation here — it
  // resolves to "every module on that date" via module_in_date, exactly like a blocked
  // category resolves via module_in_category, so it fully collapses into this list.
  // Genuine schedule conflict between two different eligible modules (neither individually
  // blocked) is a separate concern, checked directly via AllocationModule.dateIds.
  eligibleModuleIds: ModuleId[];
}

// --- Input ---
export interface AllocationInput {
  students: AllocationStudent[];
  modules: AllocationModule[];
  categories: AllocationCategory[];
  groups: AllocationGroup[];
  rules: AllocationRule[];
}

// --- Result ---
export interface AllocationAssignment {
  studentId: StudentId;
  moduleId: ModuleId;
}

// Discriminated by type rather than a shared `studentId` field: below_min_capacity
// is inherently a module-level problem (a module ended up under its minimum
// enrollment), not a student-level one, so it carries moduleId instead.
export type AllocationIssue =
  | { type: "unassigned"; studentId: StudentId; detail: string }
  | { type: "rule_violation"; studentId: StudentId; detail: string }
  | { type: "below_min_capacity"; moduleId: ModuleId; detail: string };

export interface AllocationMetrics {
  // mean preference-satisfaction weight across all assignments (ranked and
  // unranked/filler alike) — see allocate.ts's PREFERENCE_RANK_DECAY. Purely
  // about preference quality; unassignedCount/ruleViolationCount are reported
  // separately rather than blended in, since combining them into one scalar
  // would require an arbitrary penalty weighting.
  score: number;
  unassignedCount: number;
  ruleViolationCount: number;
  // rank -> count of assignments at that rank; 0 is used for unranked/filler
  // assignments (a module the student was eligible for but never ranked).
  preferenceDistribution: Record<number, number>;
}

export interface AllocationResult {
  assignments: AllocationAssignment[];
  issues: AllocationIssue[];
  metrics: AllocationMetrics;
}

// --- Rule evaluation (review-UI check, distinct from the allocator itself) ---
// Verifies a *fixed* set of already-assigned modules against a rule — used by
// the admin review UI (planning.md Phase 4), not by allocate(). Unlike
// allocate()'s creditSubRule (a greedy, order-dependent heuristic needed
// because it runs inside a multi-student, multi-step allocation loop), this
// solves the small, fixed single-student instance exactly via backtracking —
// see evaluateRule.ts for why that trade-off differs here.
export interface SubRuleEvaluation {
  subRuleId: SubRuleId;
  satisfied: boolean;
  // subRule.categoryIds not covered by any module credited to it in the best
  // assignment found; empty when satisfied.
  missingCategoryIds: CategoryId[];
  // which of the student's assigned modules were credited toward this sub-rule
  // in the best assignment found — a module appears under at most one sub-rule.
  coveredByModuleIds: ModuleId[];
}

export interface RuleEvaluation {
  moduleCountTarget: number;
  moduleCountAssigned: number;
  moduleCountSatisfied: boolean;
  subRules: SubRuleEvaluation[];
}

// --- Config ---
export interface AllocationConfig {
  // fraction of each module's max capacity reserved for priority-rule students
  // in the prio round (allocator_planning.md Section 4), rounded up per module,
  // e.g. 0.2 = 20% -> ceil(0.2 * max). 0 disables the prio round entirely.
  prioPercent: number;
  // seeds the tie-break RNG (see rng.ts) so a run is fully reproducible for the
  // same input+config — needed to compare/redo runs and to write engine tests
  // without depending on a running backend/worker.
  seed: number;
}
