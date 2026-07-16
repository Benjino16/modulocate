// --- IDs ---
export type StudentId = string & { readonly __brand: "StudentId" };
export type ModuleId = string & { readonly __brand: "ModuleId" };
export type CategoryId = string & { readonly __brand: "CategoryId" };
export type GroupId = string & { readonly __brand: "GroupId" };
export type RuleId = string & { readonly __brand: "RuleId" };
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
// rule_alternatives = OR, category_in_rule_alternative = AND within an alternative
export interface AllocationRuleRequirement {
  categoryId: CategoryId;
  count: number;
}

export interface AllocationRuleAlternative {
  requirements: AllocationRuleRequirement[];
}

export interface AllocationRule {
  id: RuleId;
  alternatives: AllocationRuleAlternative[];
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
  eligibleModuleIds: ModuleId[]; // resolved: all blocking layers (category/module/date, group+student override) applied
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
