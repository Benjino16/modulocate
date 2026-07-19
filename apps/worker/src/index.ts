import "dotenv/config";
import { Worker, type Job } from "bullmq";
import {
  ALLOCATION_QUEUE_NAME,
  AllocationJobName,
  EMAIL_QUEUE_NAME,
  EmailJobName,
  getRedisConnection,
} from "@modulocate/queue";
import { db, emailLog } from "@modulocate/db";
import { processVotingInvite } from "./processors/votingInvite";
import { processVotingResults } from "./processors/votingResults";
import { processAllocationRun } from "./processors/allocationRun";
import { loadStudent } from "./processors/common";

const emailWorker = new Worker(
  EMAIL_QUEUE_NAME,
  async (job: Job) => {
    switch (job.name) {
      case EmailJobName.VotingInvite:
        return processVotingInvite(job.data);
      case EmailJobName.VotingResults:
        return processVotingResults(job.data);
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 5,
    // throttled against typical SMTP provider send-rate limits
    limiter: { max: 10, duration: 1000 },
  },
);

emailWorker.on("completed", async (job) => {
  const result = job.returnvalue as { recipient: string; studentId: string; projectId: string };
  await db.insert(emailLog).values({
    projectId: result.projectId,
    studentId: result.studentId,
    type: job.name,
    recipient: result.recipient,
    status: "sent",
  });
});

emailWorker.on("failed", async (job, err) => {
  if (!job) return;
  const attempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < attempts) return; // will be retried, don't log yet

  try {
    const student = await loadStudent(job.data.studentId);
    await db.insert(emailLog).values({
      projectId: student.projectId,
      studentId: student.id,
      type: job.name,
      recipient: student.email,
      status: "failed",
      error: err.message,
    });
  } catch {
    await db.insert(emailLog).values({
      projectId: job.data.projectId ?? null,
      studentId: job.data.studentId ?? null,
      type: job.name,
      recipient: "unknown",
      status: "failed",
      error: err.message,
    });
  }
});

// Separate Worker/queue from email — allocation runs are CPU-bound,
// synchronous computations over a whole project snapshot
// (packages/db/src/allocationInput.ts), nothing like email's I/O-bound,
// rate-limited sends. Failure/success is already persisted onto the run
// record itself by processAllocationRun (Redis, not emailLog), so no
// completed/failed listeners are needed here — those exist purely to log
// completed/failed jobs. concurrency: 2 caps how many runs compute at once
// per worker process, so one project's run can't starve another.
const allocationWorker = new Worker(
  ALLOCATION_QUEUE_NAME,
  async (job: Job) => {
    switch (job.name) {
      case AllocationJobName.Run:
        return processAllocationRun(job.data);
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  },
);

console.log("[worker] listening on queues:", EMAIL_QUEUE_NAME, ALLOCATION_QUEUE_NAME);

process.on("SIGTERM", async () => {
  await Promise.all([emailWorker.close(), allocationWorker.close()]);
  process.exit(0);
});
