import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Vote routes only — see studentAuth.ts and planning.md "Locked Decision: Two
// Separate Auth Mechanisms". Staff auth uses staffProcedure/better-auth
// below instead.
export const protectedStudentProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.student) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, student: ctx.student } });
});

// Portal (admin/teacher) routes — gated on a better-auth session, see
// auth.ts and planning.md "Locked Decision: Two Separate Auth Mechanisms".
// No role/permission distinction yet (tracked in planning.md Section 6) —
// any signed-in staff user can call every staff-facing procedure for now.
export const staffProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});
