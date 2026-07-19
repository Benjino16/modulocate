import { Queue } from "bullmq";
import { z } from "zod";
import { getRedisConnection } from "./connection";

export const ALLOCATION_QUEUE_NAME = "allocation";

export const AllocationJobName = {
  Run: "allocation-run",
} as const;

export const allocationRunJobSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid(),
  prioPercent: z.number().min(0).max(1),
  seed: z.number().int(),
});
export type AllocationRunJob = z.infer<typeof allocationRunJobSchema>;

let allocationQueue: Queue | undefined;

// One job per run (not one job per project) — a run is a single,
// self-contained computation over a full project snapshot (see
// packages/db/src/allocationInput.ts), so there's nothing to fan out further.
export function getAllocationQueue(): Queue {
  if (!allocationQueue) {
    allocationQueue = new Queue(ALLOCATION_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        // A run is a user-triggered, potentially expensive computation over
        // the whole project snapshot — a failure should surface as "failed"
        // on the tile for the admin to retry deliberately (new run, possibly
        // different params), not silently retry against what might be a
        // structurally bad input (see AllocationStudent.ruleId's contract).
        attempts: 1,
        removeOnComplete: { age: 60 * 60 * 24 },
        removeOnFail: { age: 60 * 60 * 24 * 7 },
      },
    });
  }
  return allocationQueue;
}
