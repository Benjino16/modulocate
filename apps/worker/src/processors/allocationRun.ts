import { allocate, isBetterAllocationResult, type AllocationResult } from "@modulocate/allocation-engine";
import { assembleAllocationInput, db } from "@modulocate/db";
import { updateAllocationRun, type AllocationRunJob } from "@modulocate/queue";

// Throttles how often a multi-iteration sweep writes progress to Redis. The
// `await` this causes is also this loop's only yield point — allocate() runs
// fully synchronously, so without it a large `iterations` sweep would block
// the whole worker process (other allocation runs, email sends) for its
// entire duration instead of just per-iteration.
const PROGRESS_WRITE_INTERVAL_MS = 750;

export async function processAllocationRun(data: AllocationRunJob) {
  const { projectId, runId, prioPercent, seed: baseSeed, fillAwareUnrankedOrder, iterations } = data;
  try {
    const { input, preIssues } = await assembleAllocationInput(db, projectId);

    let bestSeed = baseSeed;
    let bestResult: AllocationResult | undefined;
    let lastProgressWriteAt = Date.now();

    for (let i = 0; i < iterations; i++) {
      const seed = baseSeed + i;
      const result = allocate(input, { prioPercent, seed, fillAwareUnrankedOrder });
      if (!bestResult || isBetterAllocationResult(result, bestResult)) {
        bestSeed = seed;
        bestResult = result;
      }

      const isLastIteration = i === iterations - 1;
      if (iterations > 1 && (isLastIteration || Date.now() - lastProgressWriteAt >= PROGRESS_WRITE_INTERVAL_MS)) {
        lastProgressWriteAt = Date.now();
        await updateAllocationRun(projectId, runId, { progress: { completed: i + 1, total: iterations } });
      }
    }

    // Students excluded before the engine ever ran (no effective rule) are
    // folded in here so the tile's warning counts reflect the whole project,
    // not just the subset the engine actually saw. Only the kept-best result
    // needs this, not every attempt in the sweep.
    const result = bestResult!;
    result.issues = [...preIssues, ...result.issues];
    result.metrics.unassignedCount += preIssues.length;

    await updateAllocationRun(projectId, runId, {
      status: "completed",
      finishedAt: new Date().toISOString(),
      bestSeed,
      result,
    });
  } catch (err) {
    await updateAllocationRun(projectId, runId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
