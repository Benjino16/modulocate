import { desc, eq } from "drizzle-orm";
import { db, emailLog, students } from "@modulocate/db";
import { router, staffProcedure } from "../trpc";
import { projectScoped } from "./shared";

export const emailLogRouter = router({
  // Newest first, capped at 1000 rows — a project's email volume (invites +
  // resends + result mails for its student count) stays well under that, so
  // this is a safety net against unbounded growth, not real pagination.
  list: staffProcedure.input(projectScoped).query(({ input }) =>
    db
      .select({
        id: emailLog.id,
        studentId: emailLog.studentId,
        studentName: students.name,
        type: emailLog.type,
        recipient: emailLog.recipient,
        status: emailLog.status,
        error: emailLog.error,
        sentAt: emailLog.sentAt,
      })
      .from(emailLog)
      .leftJoin(students, eq(students.id, emailLog.studentId))
      .where(eq(emailLog.projectId, input.projectId))
      .orderBy(desc(emailLog.sentAt))
      .limit(1000),
  ),
});
