import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { EmailJobName, getEmailQueue } from "@modulocate/queue";
import { db, users, sessions, accounts, verifications } from "@modulocate/db";

// Staff (admin/teacher) auth only — see planning.md "Locked Decision: Two
// Separate Auth Mechanisms". Student vote sessions stay on the hand-rolled
// JWT-cookie flow in studentAuth.ts, deliberately not routed through this.
const secret: string =
  process.env.BETTER_AUTH_SECRET ||
  (() => {
    throw new Error("BETTER_AUTH_SECRET is not set");
  })();

// Only used as the baseURL fallback below (no inbound request to derive a
// host from, e.g. bootstrapAdmin.ts's direct auth.api.signUpEmail() call at
// startup) — not a secret, but still required rather than defaulted, same
// reasoning as BETTER_AUTH_SECRET above: a missing env var in some future
// environment should fail loudly at startup, not silently fall back to a
// dev hostname baked into the code.
const publicBaseURL: string =
  process.env.BETTER_AUTH_URL ||
  (() => {
    throw new Error("BETTER_AUTH_URL is not set");
  })();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: { users, sessions, accounts, verifications },
  }),
  secret,
  // Dynamic baseURL instead of a fixed string: portal is same-origin with
  // the backend behind Traefik, but "same-origin" isn't one fixed origin —
  // it's whatever host/IP the browser actually used (modulocate.localhost,
  // a LAN IP, <hostname>.local), same reasoning as the Host-agnostic
  // Traefik routing in infra/traefik/dynamic.yml. allowedHosts: ["*"] also
  // seeds better-auth's own CSRF origin-check (trustedOrigins) with a
  // matching wildcard, so requests from any of those hosts pass — a fixed
  // baseURL here was the actual cause of the "Invalid origin" error seen
  // when logging in from a phone on the LAN.
  baseURL: {
    allowedHosts: ["*"],
    protocol: "http",
    fallback: publicBaseURL,
  },
  emailAndPassword: {
    enabled: true,
    // Enqueued instead of sent inline — same email queue/worker every other
    // transactional mail goes through (see packages/queue/src/email.ts),
    // for consistent retry behavior and an emailLog entry.
    sendResetPassword: async ({ user, url }) => {
      await getEmailQueue().add(EmailJobName.PasswordReset, {
        userId: user.id,
        email: user.email,
        resetLink: url,
      });
    },
    // A password reset is the "I may have lost control of this account"
    // path — any session started before the reset (e.g. an attacker's)
    // should not survive it. changePassword's own revokeOtherSessions flag
    // (set from the portal UI) covers the same intent for the "I still know
    // my password" path.
    revokeSessionsOnPasswordReset: true,
  },
  // Keeps id format consistent with every other table in the schema
  // (uuid.defaultRandom()) instead of better-auth's own default id shape.
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
  },
});
