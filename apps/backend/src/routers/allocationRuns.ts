import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { allocationRunCreateInput } from "@modulocate/shared";
import {
  AllocationJobName,
  createAllocationRun,
  deleteAllocationRun,
  getAllocationQueue,
  getAllocationRun,
  listAllocationRuns,
  type AllocationRunRecord,
} from "@modulocate/queue";
import { router, publicProcedure } from "../trpc";
import { projectScoped } from "./shared";

// Tile-list shape: everything but the (potentially large) assignments/issues
// payload, plus derived counts the portal's warning icons need. The full
// record (incl. `result`) is only fetched by `get`, for the future
// run-detail dialog.
function toSummary(run: AllocationRunRecord) {
  const { result, ...rest } = run;
  return {
    ...rest,
    metrics: result
      ? {
          score: result.metrics.score,
          unassignedCount: result.metrics.unassignedCount,
          ruleViolationCount: result.metrics.ruleViolationCount,
          belowMinCapacityCount: result.issues.filter((issue) => issue.type === "below_min_capacity").length,
        }
      : undefined,
  };
}

export const allocationRunsRouter = router({
  list: publicProcedure.input(projectScoped).query(async ({ input }) => {
    const runs = await listAllocationRuns(input.projectId);
    return runs.map(toSummary);
  }),

  // Full record incl. assignments/issues — not consumed by the portal yet
  // (the run-detail dialog is a follow-up), but wired up now alongside the
  // rest of the CRUD surface.
  get: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .query(async ({ input }) => {
      const run = await getAllocationRun(input.projectId, input.id);
      if (!run) throw new TRPCError({ code: "NOT_FOUND" });
      return run;
    }),

  // Writes the run record with status "running" synchronously (so the tile
  // shows up on the portal immediately) before handing the actual
  // computation off to the worker via BullMQ.
  start: publicProcedure
    .input(allocationRunCreateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      const id = randomUUID();
      const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
      const createdAt = new Date().toISOString();

      await createAllocationRun({
        id,
        projectId: input.projectId,
        createdAt,
        status: "running",
        config: { prioPercent: input.prioPercent, seed },
      });

      await getAllocationQueue().add(AllocationJobName.Run, {
        projectId: input.projectId,
        runId: id,
        prioPercent: input.prioPercent,
        seed,
      });

      return { id };
    }),

  remove: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      const deleted = await deleteAllocationRun(input.projectId, input.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: input.id };
    }),
});
