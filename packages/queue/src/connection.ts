import IORedis from "ioredis";

let connection: IORedis | undefined;

// One shared connection per process — BullMQ Queue/Worker instances all reuse
// it instead of opening a socket each. `maxRetriesPerRequest: null` is
// required by BullMQ for the blocking commands it issues.
export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}
