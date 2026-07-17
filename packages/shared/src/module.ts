import { z } from "zod";

// Fields a client may set. Deliberately excludes columns that are never client
// input: `id`/`projectId` (server-assigned/derived from the tRPC context, never
// trusted from the client) and `permanentName` (system-assigned, tracks "the
// same" module across projects — not something a user types in).
const moduleFields = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  teacher: z.string().optional(),
  pictureUrl: z.url().optional(),
  min: z.number().int().nonnegative(),
  max: z.number().int().nonnegative(),
});

export const moduleCreateInput = moduleFields.refine((data) => data.max >= data.min, {
  message: "max must be >= min",
  path: ["max"],
});

export const moduleUpdateInput = z.object({
  id: z.uuid(),
  ...moduleFields.partial().shape,
});
// Note: partial updates skip the max>=min cross-field check for now — enforcing
// it correctly requires comparing against the persisted row, not just the patch.
// Revisit once the update procedure actually reads-before-write.

export type ModuleCreateInput = z.infer<typeof moduleCreateInput>;
export type ModuleUpdateInput = z.infer<typeof moduleUpdateInput>;
