import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { STUDENT_SESSION_COOKIE, verifyStudentSession } from "./studentAuth";

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  const token = req.cookies[STUDENT_SESSION_COOKIE];
  const student = token ? verifyStudentSession(token) : null;
  return { req, res, student };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
