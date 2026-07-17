import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });

// db itself or an open transaction — whatever `db.transaction(async (tx) => ...)` hands back.
// Lives here (not in a single app) so both apps/backend and apps/worker can pass their own
// db/tx into shared query functions like resolveStudentEligibility.
export type DbExecutor = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];
