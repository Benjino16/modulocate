import { and, eq } from "drizzle-orm";
import { db, students, settings } from "@modulocate/db";

export async function loadStudent(studentId: string) {
  const [student] = await db.select().from(students).where(eq(students.id, studentId));
  if (!student) {
    throw new Error(`Student ${studentId} not found`);
  }
  return student;
}

export async function loadSetting(projectId: string, key: string): Promise<string> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.projectId, projectId), eq(settings.key, key)));
  return (row?.value as string) ?? "";
}
