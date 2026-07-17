import jwt from "jsonwebtoken";

// Student vote sessions are deliberately not better-auth — see planning.md
// "Locked Decision: Two Separate Auth Mechanisms". A student session is a
// scoped, ephemeral access grant (no password, dies with the project), not a
// persistent identity, so it gets its own small sign/verify pair instead of
// being forced into better-auth's user model.
const SECRET: string =
  process.env.STUDENT_SESSION_SECRET ??
  (() => {
    throw new Error("STUDENT_SESSION_SECRET is not set");
  })();

const EXPIRY = "7d";
export const STUDENT_SESSION_COOKIE = "modulocate_vote_session";

export interface StudentSession {
  studentId: string;
  projectId: string;
}

export function signStudentSession(payload: StudentSession): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRY });
}

// `students.signInCode` itself never expires — re-clicking the emailed link
// always mints a fresh 7-day cookie, which doubles as "lost session" recovery
// without a separate reset flow.
export function verifyStudentSession(token: string): StudentSession | null {
  try {
    const decoded = jwt.verify(token, SECRET);
    if (typeof decoded !== "object" || decoded === null) return null;
    const { studentId, projectId } = decoded as Record<string, unknown>;
    if (typeof studentId !== "string" || typeof projectId !== "string") return null;
    return { studentId, projectId };
  } catch {
    return null;
  }
}
