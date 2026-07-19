import { z } from "zod";

// Starts one allocation-engine run (allocator_planning.md) via the worker.
// Runs live only in Redis until an admin explicitly loads one into the DB
// (planning.md Phase 3/4) — nothing here writes to Postgres.
export const allocationRunCreateInput = z.object({
  // fraction of each module's max capacity reserved for priority-rule
  // students in the prio round, e.g. 0.2 = 20% (allocator_planning.md
  // Section 4). The portal collects this as a 0-100 percent field and
  // divides by 100 before sending.
  prioPercent: z.number().min(0).max(1),
  // omitted -> a random seed is generated server-side; set explicitly only
  // when the admin wants to reproduce or compare a specific run
  // (allocation-engine's AllocationConfig.seed).
  seed: z.number().int().optional(),
});

export type AllocationRunCreateInput = z.infer<typeof allocationRunCreateInput>;
