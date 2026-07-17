import { Queue } from "bullmq";
import { z } from "zod";
import { getRedisConnection } from "./connection";

export const EMAIL_QUEUE_NAME = "email";

export const EmailJobName = {
  VotingInvite: "voting-invite",
  VotingResults: "voting-results",
} as const;

export const votingInviteJobSchema = z.object({
  studentId: z.string().uuid(),
  projectId: z.string().uuid(),
});
export type VotingInviteJob = z.infer<typeof votingInviteJobSchema>;

export const votingResultsJobSchema = z.object({
  studentId: z.string().uuid(),
  projectId: z.string().uuid(),
});
export type VotingResultsJob = z.infer<typeof votingResultsJobSchema>;

let emailQueue: Queue | undefined;

// One job per recipient (not one job per batch) — a bad address only retries
// itself, and BullMQ's limiter throttles the whole batch against SMTP limits.
export function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue(EMAIL_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 60 * 60 * 24 * 7 },
        removeOnFail: { age: 60 * 60 * 24 * 30 },
      },
    });
  }
  return emailQueue;
}
