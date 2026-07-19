import { allocate } from "@modulocate/allocation-engine";
import { assembleAllocationInput, db } from "@modulocate/db";
import { updateAllocationRun, type AllocationRunJob } from "@modulocate/queue";

export async function processAllocationRun(data: AllocationRunJob) {
  const { projectId, runId, prioPercent, seed } = data;
  try {
    const { input, preIssues } = await assembleAllocationInput(db, projectId);
    const result = allocate(input, { prioPercent, seed });

    // Students excluded before the engine ever ran (no effective rule) are
    // folded in here so the tile's warning counts reflect the whole project,
    // not just the subset the engine actually saw.
    result.issues = [...preIssues, ...result.issues];
    result.metrics.unassignedCount += preIssues.length;

    await updateAllocationRun(projectId, runId, {
      status: "completed",
      finishedAt: new Date().toISOString(),
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
