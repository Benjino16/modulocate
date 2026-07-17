import { eq } from "drizzle-orm";
import { db, students } from "@modulocate/db";

export async function loadStudent(studentId: string) {
  const [student] = await db.select().from(students).where(eq(students.id, studentId));
  if (!student) {
    throw new Error(`Student ${studentId} not found`);
  }
  return student;
}
