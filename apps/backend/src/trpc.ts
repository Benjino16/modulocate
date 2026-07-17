import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Vote routes only — see studentAuth.ts and planning.md "Locked Decision: Two
// Separate Auth Mechanisms". Admin/teacher routes stay publicProcedure until
// better-auth is wired up (tracked separately, see planning.md Section 6).
export const protectedStudentProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.student) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, student: ctx.student } });
});
