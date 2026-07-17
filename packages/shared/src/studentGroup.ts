import { z } from "zod";

// Structurally identical to moduleFields in ./module.ts (flat entity, no nested
// children) — the "boring" half of this second CRUD example, in contrast to
// rule.ts's nested aggregate.
const studentGroupFields = z.object({
  name: z.string().min(1),
  ruleId: z.uuid().nullable().optional(),
});

export const studentGroupCreateInput = studentGroupFields;

export const studentGroupUpdateInput = z.object({
  id: z.uuid(),
  ...studentGroupFields.partial().shape,
});

export type StudentGroupCreateInput = z.infer<typeof studentGroupCreateInput>;
export type StudentGroupUpdateInput = z.infer<typeof studentGroupUpdateInput>;
