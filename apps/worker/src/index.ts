import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { EMAIL_QUEUE_NAME, EmailJobName, getRedisConnection } from "@modulocate/queue";
import { db, emailLog } from "@modulocate/db";
import { processVotingInvite } from "./processors/votingInvite";
import { processVotingResults } from "./processors/votingResults";
import { loadStudent } from "./processors/common";

const worker = new Worker(
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

worker.on("completed", async (job) => {
  const result = job.returnvalue as { recipient: string; studentId: string; projectId: string };
  await db.insert(emailLog).values({
    projectId: result.projectId,
    studentId: result.studentId,
    type: job.name,
    recipient: result.recipient,
    status: "sent",
  });
});

worker.on("failed", async (job, err) => {
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

console.log("[worker] listening on queue:", EMAIL_QUEUE_NAME);

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
