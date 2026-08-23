import { writeFileSync } from "node:fs";
import { Worker, type Job } from "bullmq";
import { and, eq, isNull } from "drizzle-orm";
import {
  ALLOCATION_QUEUE_NAME,
  AllocationJobName,
  EMAIL_QUEUE_NAME,
  EmailJobName,
  getRedisConnection,
} from "@modulocate/queue";
import { db, emailLog, students } from "@modulocate/db";
import { processVotingInvite } from "./processors/votingInvite";
import { processVotingResults } from "./processors/votingResults";
import { processPasswordReset } from "./processors/passwordReset";
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
      case EmailJobName.PasswordReset:
        return processPasswordReset(job.data);
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
  // Password reset targets a staff user (emailLog.userId), not a student —
  // separate branch since the two never share a shape.
  if (job.name === EmailJobName.PasswordReset) {
    const result = job.returnvalue as { recipient: string; userId: string };
    await db.insert(emailLog).values({
      userId: result.userId,
      type: job.name,
      recipient: result.recipient,
      status: "sent",
    });
    return;
  }

  const result = job.returnvalue as { recipient: string; studentId: string; projectId: string };
  await db.insert(emailLog).values({
    projectId: result.projectId,
    studentId: result.studentId,
    type: job.name,
    recipient: result.recipient,
    status: "sent",
  });

  // First-send-only marker, deliberately separate from emailLog above (which
  // records every send) — a second address or a later manual resend must not
  // move this timestamp.
  if (job.name === EmailJobName.VotingInvite) {
    await db
      .update(students)
      .set({ voteCodeSentAt: new Date() })
      .where(and(eq(students.id, result.studentId), isNull(students.voteCodeSentAt)));
  }

  if (job.name === EmailJobName.VotingResults) {
    await db
      .update(students)
      .set({ resultsSentAt: new Date() })
      .where(and(eq(students.id, result.studentId), isNull(students.resultsSentAt)));
  }
});

emailWorker.on("failed", async (job, err) => {
  if (!job) return;
  const attempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < attempts) return; // will be retried, don't log yet

  if (job.name === EmailJobName.PasswordReset) {
    await db.insert(emailLog).values({
      userId: job.data.userId,
      type: job.name,
      recipient: job.data.email,
      status: "failed",
      error: err.message,
    });
    return;
  }

  try {
    const student = await loadStudent(job.data.studentId);
    const recipient = [student.email, student.email2].filter((email): email is string => !!email).join(", ");
    await db.insert(emailLog).values({
      projectId: student.projectId,
      studentId: student.id,
      type: job.name,
      recipient,
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

// No HTTP server to probe here (unlike backend), so Docker's HEALTHCHECK
// (infra/Dockerfile.worker) watches this file's mtime instead — stale means
// the event loop is stuck, not just "no jobs right now".
const HEALTH_FILE = "/tmp/worker-healthy";
const touchHealthFile = () => writeFileSync(HEALTH_FILE, "");
touchHealthFile();
setInterval(touchHealthFile, 15_000).unref();

process.on("SIGTERM", async () => {
  await Promise.all([emailWorker.close(), allocationWorker.close()]);
  process.exit(0);
});
