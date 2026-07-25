import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
// Side-effect-only: loads @fastify/cookie's module augmentation (adds
// req.cookies/res.setCookie/res.clearCookie to Fastify's types) so it's
// visible to consumers that only pull in this file's types, like the
// portal's type-only `AppRouter` import, which never reaches src/index.ts
// where the plugin is otherwise registered.
import type {} from "@fastify/cookie";
import { fromNodeHeaders } from "better-auth/node";
import { STUDENT_SESSION_COOKIE, verifyStudentSession } from "./studentAuth";
import { auth } from "./auth";

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  const token = req.cookies[STUDENT_SESSION_COOKIE];
  const student = token ? verifyStudentSession(token) : null;
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  return { req, res, student, session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
