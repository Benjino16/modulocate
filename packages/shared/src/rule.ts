import { z } from "zod";

// Mirrors AllocationSubRule's shape in packages/allocation-engine/src/types.ts:
// a sub-rule is just a set of categories, any one of which (via a single module
// that is a member of all of them, or several modules whose combined category
// membership covers the set) satisfies it.
//
// Categories may repeat across sub-rules of the same rule — that's the intended
// way to express "N of category X" without a count field: "2x Sport" is two
// sub-rules that each hold just {Sport} (see db_planning.md / types.ts).
// Exclusivity is enforced at allocation time on *assigned modules* ("a module
// may satisfy at most one sub-rule"), never here on the category sets — so
// there is nothing to cross-check between sub-rules at input-validation time.
const subRuleInput = z.object({
  categoryIds: z.array(z.uuid()).min(1),
});

const ruleFields = z.object({
  name: z.string().min(1),
  // how many modules a student under this rule should end up with
  moduleCount: z.number().int().min(1),
  // whether students under this rule get priority during allocation
  priority: z.boolean().default(false),
  // Empty by default — sub-rule/category authoring is deferred, same as
  // module/category/date relations (see db_planning.md); a rule can exist
  // with just a name until that UI lands.
  subRules: z.array(subRuleInput).default([]),
  // categories blocked for students under this rule (rule_blocked_category) —
  // blocked_module was dropped, the same effect is reachable by putting the
  // module in its own category and blocking that category instead.
  blockedCategoryIds: z.array(z.uuid()).default([]),
});

export const ruleCreateInput = ruleFields;

// Update replaces the whole sub-rule set when subRules is provided, rather than
// diffing individual sub-rules by id — sub-rule ids aren't referenced anywhere
// outside category_in_sub_rule (nothing stores "sub-rule #X" across time), so a
// full replace is simpler and just as correct as a partial patch would be.
// blockedCategoryIds follows the same full-replace convention.
export const ruleUpdateInput = z.object({
  id: z.uuid(),
  name: z.string().min(1).optional(),
  moduleCount: z.number().int().min(1).optional(),
  priority: z.boolean().optional(),
  subRules: z.array(subRuleInput).optional(),
  blockedCategoryIds: z.array(z.uuid()).optional(),
});

export type RuleCreateInput = z.infer<typeof ruleCreateInput>;
export type RuleUpdateInput = z.infer<typeof ruleUpdateInput>;
