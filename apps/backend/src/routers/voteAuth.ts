import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { db, students } from "@modulocate/db";
import { router, publicProcedure } from "../trpc";
import { STUDENT_SESSION_COOKIE, signStudentSession } from "../studentAuth";

// vote-web and backend are different origins but the same site (same
// hostname, different port only — port isn't part of "site" for SameSite
// purposes), so Lax already lets the cookie through on same-host requests.
// Not Secure/None: dev only runs over plain http, including from a phone on
// the LAN, where Secure cookies get silently dropped (no HTTPS there).
// TODO: once frontend/backend move to actually different hosts (production),
// this needs secure: true + sameSite: "none" behind HTTPS.
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: false,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7 days, matches the JWT's own expiry in studentAuth.ts
};

export const voteAuthRouter = router({
  // Exchanges the (non-expiring) signInCode from the emailed link for a
  // short-lived session cookie. Re-visiting the link always mints a fresh
  // cookie, which doubles as "lost session" recovery.
  login: publicProcedure
    .input(z.object({ code: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const [student] = await db.select().from(students).where(eq(students.signInCode, input.code));
      if (!student) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Ungültiger Link." });
      }

      // First-open timestamp — only set once, so re-visiting the link on
      // later logins doesn't overwrite when the student first opened it.
      if (!student.voteOpenedAt) {
        await db.update(students).set({ voteOpenedAt: new Date() }).where(eq(students.id, student.id));
      }

      const token = signStudentSession({ studentId: student.id, projectId: student.projectId });
      ctx.res.setCookie(STUDENT_SESSION_COOKIE, token, COOKIE_OPTIONS);

      return { studentId: student.id, name: student.name, projectId: student.projectId };
    }),

  // HttpOnly cookies can't be cleared from client JS, so "logout" has to be a
  // server round-trip that overwrites it with an already-expired one.
  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(STUDENT_SESSION_COOKIE, { path: "/" });
    return { success: true as const };
  }),

  me: publicProcedure.query(({ ctx }) => ctx.student),
});
