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
  // omitted -> defaults to true server-side, matching allocation-engine's own
  // default (AllocationConfig.fillAwareUnrankedOrder). Orders each student's
  // unranked/filler modules by fill priority instead of pure randomization —
  // modules still below their min go first, then modules are balanced by the
  // largest fraction of max still free.
  fillAwareUnrankedOrder: z.boolean().optional(),
  // omitted -> 1, i.e. the classic single-run behavior. When >1, the worker
  // runs `allocate()` once per seed in [seed, seed+iterations) over the same
  // project snapshot and keeps only the best result (allocation-engine's
  // isBetterAllocationResult) instead of storing every attempt. 10000 was
  // benchmarked at this project's real scale (~105 students/46 modules) at
  // ~3-5 minutes — allocate()'s per-run cost scales roughly quadratically
  // with student count (packages/allocation-engine/src/allocate.ts's
  // pickNeediest does an O(active students) scan per assignment), so this
  // cap should be revisited before it's ever used against a much larger
  // school.
  iterations: z.number().int().min(1).max(10000).optional(),
});

export type AllocationRunCreateInput = z.infer<typeof allocationRunCreateInput>;
