import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { db, students } from "@modulocate/db";
import { router, publicProcedure } from "../trpc";
import { STUDENT_SESSION_COOKIE, signStudentSession } from "../studentAuth";

// vote-web and backend are same-origin behind Traefik
// (http://modulocate.localhost, path-routed — see infra/compose.yaml), in
// both dev and prod, so sameSite: "lax" is correct permanently, not just a
// dev shortcut. secure stays false since this still runs over plain HTTP;
// flip to true once real HTTPS termination is set up in front of Traefik.
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
