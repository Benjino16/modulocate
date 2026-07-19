import type { AllocationConfig, AllocationResult } from "@modulocate/allocation-engine";
import { getRedisConnection } from "./connection";

export type AllocationRunStatus = "running" | "completed" | "failed";

// Stored as a raw JSON blob in Redis, not a DB table — see planning.md Phase 3
// ("each run is stored not in the main DB, but as raw JSON in Redis"). Only an
// explicit admin action later (not built yet) turns a selected run into
// production `assignments`.
export interface AllocationRunRecord {
  id: string;
  projectId: string;
  // when the admin triggered the run — the portal tile's title (date + time),
  // set by the backend's `start` mutation, not by the worker.
  createdAt: string;
  finishedAt?: string;
  status: AllocationRunStatus;
  config: AllocationConfig;
  result?: AllocationResult;
  error?: string;
}

function runKey(projectId: string, runId: string): string {
  return `allocation-run:${projectId}:${runId}`;
}

function indexKey(projectId: string): string {
  return `allocation-runs:${projectId}`;
}

// Written synchronously by the backend's `start` mutation with status
// "running", before the job is even picked up by the worker — so the tile
// appears on the portal immediately instead of waiting for the worker.
export async function createAllocationRun(record: AllocationRunRecord): Promise<void> {
  const redis = getRedisConnection();
  await redis.set(runKey(record.projectId, record.id), JSON.stringify(record));
  await redis.zadd(indexKey(record.projectId), Date.parse(record.createdAt), record.id);
}

// Read-modify-write over one JSON blob rather than a Redis hash — almost
// every read wants the whole record anyway (tile summary and, later, the
// detail dialog alike), so there's no per-field access pattern to optimize for.
export async function updateAllocationRun(
  projectId: string,
  runId: string,
  patch: Partial<Omit<AllocationRunRecord, "id" | "projectId" | "createdAt">>,
): Promise<void> {
  const existing = await getAllocationRun(projectId, runId);
  if (!existing) throw new Error(`Allocation run ${runId} not found for project ${projectId}`);
  const redis = getRedisConnection();
  await redis.set(runKey(projectId, runId), JSON.stringify({ ...existing, ...patch }));
}

export async function getAllocationRun(projectId: string, runId: string): Promise<AllocationRunRecord | undefined> {
  const redis = getRedisConnection();
  const raw = await redis.get(runKey(projectId, runId));
  return raw ? (JSON.parse(raw) as AllocationRunRecord) : undefined;
}

// Newest first — the portal renders runs top-to-bottom by start time.
export async function listAllocationRuns(projectId: string): Promise<AllocationRunRecord[]> {
  const redis = getRedisConnection();
  const runIds = await redis.zrevrange(indexKey(projectId), 0, -1);
  if (runIds.length === 0) return [];
  const raws = await redis.mget(runIds.map((id) => runKey(projectId, id)));
  return raws.filter((raw): raw is string => raw !== null).map((raw) => JSON.parse(raw) as AllocationRunRecord);
}

export async function deleteAllocationRun(projectId: string, runId: string): Promise<boolean> {
  const redis = getRedisConnection();
  const removed = await redis.del(runKey(projectId, runId));
  await redis.zrem(indexKey(projectId), runId);
  return removed > 0;
}
