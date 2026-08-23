import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { db, projects } from "@modulocate/db";
import { projectPhase } from "@modulocate/shared";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Vote routes only — see studentAuth.ts and planning.md "Locked Decision: Two
// Separate Auth Mechanisms". Staff auth uses staffProcedure/better-auth
// below instead. A valid JWT alone isn't enough — it's minted while the
// project is in the voting phase but never expires until 7 days pass, so it
// could otherwise still be used to read survey data after the election
// closes or before it opens.
export const protectedStudentProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.student) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const [project] = await db.select().from(projects).where(eq(projects.id, ctx.student.projectId));
  if (!project || project.phase !== projectPhase.enum.voting) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Die Umfrage ist aktuell nicht offen." });
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
