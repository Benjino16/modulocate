import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  modules,
  moduleCategories,
  moduleInCategory,
  studentInModule,
  resolveModuleDisplayScheduleLabels,
} from "@modulocate/db";
import { sendVotingResultsEmail } from "@modulocate/mailer";
import type { VotingResultsJob } from "@modulocate/queue";
import { loadStudent, loadSetting } from "./common";

export async function processVotingResults(data: VotingResultsJob) {
  const student = await loadStudent(data.studentId);
  const assigned = await db
    .select({
      id: modules.id,
      name: modules.name,
      scheduleLabel: modules.scheduleLabel,
      description: modules.description,
    })
    .from(studentInModule)
    .innerJoin(modules, eq(modules.id, studentInModule.moduleId))
    .where(eq(studentInModule.studentId, student.id));
  const moduleIds = assigned.map((m) => m.id);

  const [displayScheduleLabelByModule, categoryRows] = await Promise.all([
    resolveModuleDisplayScheduleLabels(db, moduleIds),
    moduleIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ moduleId: moduleInCategory.moduleId, name: moduleCategories.name })
          .from(moduleInCategory)
          .innerJoin(moduleCategories, eq(moduleInCategory.categoryId, moduleCategories.id))
          .where(and(inArray(moduleInCategory.moduleId, moduleIds), eq(moduleCategories.hiddenInVote, false))),
  ]);
  const categoryNamesByModule = new Map<string, string[]>();
  for (const row of categoryRows) {
    const list = categoryNamesByModule.get(row.moduleId) ?? [];
    list.push(row.name);
    categoryNamesByModule.set(row.moduleId, list);
  }

  const introHtml = await loadSetting(data.projectId, "votingResultsIntro");
  const recipients = [student.email, student.email2].filter((email): email is string => !!email);

  await sendVotingResultsEmail({
    to: recipients,
    studentName: student.name,
    modules: assigned.map((m) => ({
      name: m.name,
      displayScheduleLabel: m.scheduleLabel || displayScheduleLabelByModule.get(m.id) || null,
      categoryNames: categoryNamesByModule.get(m.id) ?? [],
      description: m.description,
    })),
    introHtml,
  });
  return { recipient: recipients.join(", "), studentId: student.id, projectId: student.projectId };
}
