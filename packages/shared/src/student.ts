import { z } from "zod";

// Fields a client may set. Deliberately excludes `id`/`projectId` (server-derived,
// same as module.ts) and `signInCode`/`voteStatus` — both system-managed state
// (presigned-link auth token, vote progress tracking) rather than regular data
// entry.
const studentFields = z.object({
  name: z.string().min(1),
  email: z.email(),
  email2: z.email().nullable().optional(),
  ruleId: z.uuid().nullable().optional(),
  // "Klasse" in the UI — not a column on students, the router resolves this
  // against student_in_group (single membership, wholesale-replaced on update).
  groupId: z.uuid().nullable().optional(),
});

export const studentCreateInput = studentFields;

export const studentUpdateInput = z.object({
  id: z.uuid(),
  ...studentFields.partial().shape,
});

export type StudentCreateInput = z.infer<typeof studentCreateInput>;
export type StudentUpdateInput = z.infer<typeof studentUpdateInput>;
