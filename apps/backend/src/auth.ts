import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db, users, sessions, accounts, verifications } from "@modulocate/db";

// Staff (admin/teacher) auth only — see planning.md "Locked Decision: Two
// Separate Auth Mechanisms". Student vote sessions stay on the hand-rolled
// JWT-cookie flow in studentAuth.ts, deliberately not routed through this.
const secret: string =
  process.env.BETTER_AUTH_SECRET ??
  (() => {
    throw new Error("BETTER_AUTH_SECRET is not set");
  })();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: { users, sessions, accounts, verifications },
  }),
  secret,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
  },
  // Keeps id format consistent with every other table in the schema
  // (uuid.defaultRandom()) instead of better-auth's own default id shape.
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
  },
  // No trustedOrigins needed: portal is same-origin with the backend behind
  // Traefik (http://modulocate.localhost), not a separate host/port.
});
