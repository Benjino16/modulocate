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
  ruleId: RuleId | null; // resolved: student.rule_id overrides group.rule_id
  preferences: AllocationPreference[]; // only modules the student was allowed to see
  eligibleModuleIds: ModuleId[]; // resolved: modules not excluded by the effective rule's blocked category/module/date (composition-resolved)
  blockedDateIds: DateId[]; // resolved: the effective rule's blocked dates, for schedule-conflict checks alongside module.dateIds
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

export interface AllocationIssue {
  studentId: StudentId;
  type: "unassigned" | "rule_violation" | "below_min_capacity";
  detail: string;
}

export interface AllocationMetrics {
  score: number;
  unassignedCount: number;
  ruleViolationCount: number;
  preferenceDistribution: Record<number, number>; // rank -> count of students who got that rank
}

export interface AllocationResult {
  assignments: AllocationAssignment[];
  issues: AllocationIssue[];
  metrics: AllocationMetrics;
}
