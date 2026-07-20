// Fills the DB with synthetic-but-realistic demo/dev data across three
// projects, one per point in the phase lifecycle, so you always have a
// project ready for whatever you want to show or test:
//
//  - "Projektwoche 2026"        (setup)     — fully configured, nobody has
//                                             voted yet. Use this one to
//                                             demo *opening* the vote live.
//  - "Wahlpflichtkurse 2026/II" (voting)    — ~60% of students have voted.
//                                             Use this for the live
//                                             monitoring/progress views
//                                             without clicking through 70
//                                             submissions by hand.
//  - "Projektwoche 2025"        (finalized) — 100% voted, and the real
//                                             allocation engine has already
//                                             run on it. Use this for
//                                             review/results/report views.
//
// Deliberately does not touch `users` or `audit_logs` — this is project/
// domain data only, not auth accounts.
//
// Run with `pnpm --filter @modulocate/db db:seed`. Re-running wipes and
// recreates all three projects (truncate + reseed), so it's always safe to
// run again after a schema change or when demo data has drifted.

import "dotenv/config";
import { fakerDE as faker } from "@faker-js/faker";
import { eq, sql } from "drizzle-orm";
import { allocate } from "@modulocate/allocation-engine";
import type { ProjectPhase } from "@modulocate/shared";
import { db } from "../client";
import { resolveStudentEligibility } from "../eligibility";
import { assembleAllocationInput } from "../allocationInput";
import {
  dateSortTags,
  dates,
  moduleCategories,
  moduleInCategory,
  moduleInDate,
  modules,
  projects,
  ruleBlockedCategory,
  ruleBlockedDate,
  rules,
  studentGroups,
  studentInGroup,
  studentInModule,
  studentPreferences,
  students,
} from "../schema";
import {
  CATEGORIES,
  DATE_LABELS,
  DATE_SORT_TAGS,
  GROUPS,
  MODULES,
  POPULARITY_WEIGHT,
  RULES,
  resolveModuleDates,
  resolveModuleDateSortLabel,
  resolveModuleScheduleLabel,
} from "./fixtures";

const SEED = 42;
faker.seed(SEED);

// Only project-scoped domain tables — `users` and `audit_logs` are left
// alone so this never touches whatever admin login you already have set up.
// CASCADE also empties `email_log` (it references `projects`/`students`),
// which is correct: log rows for data we're about to delete are orphans.
const RESET_TABLES = [
  "student_in_module",
  "student_preferences",
  "rule_blocked_date",
  "rule_blocked_category",
  "module_in_date",
  "student_in_group",
  "students",
  "student_groups",
  "category_in_sub_rule",
  "sub_rules",
  "rules",
  "module_in_category",
  "modules",
  "module_categories",
  "dates",
  "date_sort_tags",
  "category_sort_tags",
  "settings",
  "projects",
];

interface ProjectScenario {
  name: string;
  phase: ProjectPhase;
  voting: "none" | "partial" | "full";
  runAllocation: boolean;
}

const SCENARIOS: ProjectScenario[] = [
  { name: "Projektwoche 2026", phase: "setup", voting: "none", runAllocation: false },
  { name: "Wahlpflichtkurse 2026/II", phase: "voting", voting: "partial", runAllocation: false },
  { name: "Projektwoche 2025", phase: "finalized", voting: "full", runAllocation: true },
];

let emailCounter = 0;
function uniqueEmail(fullName: string) {
  emailCounter += 1;
  const slug = fullName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]+/g, ".");
  return `${slug}.${emailCounter}@schule-demo.example`;
}

async function resetDb() {
  const tableList = sql.raw(RESET_TABLES.map((t) => `"${t}"`).join(", "));
  await db.execute(sql`truncate table ${tableList} restart identity cascade`);
}

async function seedProject(scenario: ProjectScenario) {
  const [project] = await db.insert(projects).values({ name: scenario.name, phase: scenario.phase }).returning();

  const categoryIdByName = new Map<string, string>();
  for (const name of CATEGORIES) {
    const [row] = await db.insert(moduleCategories).values({ projectId: project.id, name }).returning();
    categoryIdByName.set(name, row.id);
  }

  const dateIdByLabel = new Map<string, string>();
  for (const label of DATE_LABELS) {
    const [row] = await db.insert(dates).values({ projectId: project.id, name: label }).returning();
    dateIdByLabel.set(label, row.id);
  }

  const dateSortTagIdByLabel = new Map<string, string>();
  for (const [index, label] of DATE_SORT_TAGS.entries()) {
    const [row] = await db
      .insert(dateSortTags)
      .values({ projectId: project.id, label, sortOrder: index })
      .returning();
    dateSortTagIdByLabel.set(label, row.id);
  }

  const popularityWeightByModuleId = new Map<string, number>();
  for (const m of MODULES) {
    const dateLabels = resolveModuleDates(m);
    const scheduleLabel = resolveModuleScheduleLabel(m, dateLabels);
    const dateSortLabel = resolveModuleDateSortLabel(m);

    const [row] = await db
      .insert(modules)
      .values({
        projectId: project.id,
        permanentName: m.name,
        name: m.name,
        teacher: m.teacher,
        min: m.min,
        max: m.max,
        scheduleLabel,
        dateSortId: dateSortLabel ? dateSortTagIdByLabel.get(dateSortLabel) : undefined,
      })
      .returning();
    popularityWeightByModuleId.set(row.id, POPULARITY_WEIGHT[m.popularity]);

    await db.insert(moduleInCategory).values(
      m.categories.map((c) => ({ moduleId: row.id, categoryId: categoryIdByName.get(c)!, projectId: project.id })),
    );
    // One row per date — a module can occupy more than one slot (see
    // ModuleFixture.dateLabels's comment in fixtures.ts). A module with no
    // dateLabels legitimately has zero rows here.
    if (dateLabels.length > 0) {
      await db.insert(moduleInDate).values(
        dateLabels.map((label) => ({ moduleId: row.id, dateId: dateIdByLabel.get(label)!, projectId: project.id })),
      );
    }
  }

  const ruleIdByName = new Map<string, string>();
  const ruleFixtureById = new Map<string, (typeof RULES)[number]>();
  for (const r of RULES) {
    const [row] = await db
      .insert(rules)
      .values({ projectId: project.id, name: r.name, moduleCount: r.moduleCount, priority: r.priority })
      .returning();
    ruleIdByName.set(r.name, row.id);
    ruleFixtureById.set(row.id, r);

    if (r.blockedCategoryNames?.length) {
      await db.insert(ruleBlockedCategory).values(
        r.blockedCategoryNames.map((c) => ({
          ruleId: row.id,
          categoryId: categoryIdByName.get(c)!,
          projectId: project.id,
        })),
      );
    }
    if (r.blockedDateLabels?.length) {
      await db.insert(ruleBlockedDate).values(
        r.blockedDateLabels.map((d) => ({
          ruleId: row.id,
          dateId: dateIdByLabel.get(d)!,
          projectId: project.id,
        })),
      );
    }
  }

  const groupRows: { id: string; name: string; studentCount: number }[] = [];
  for (const g of GROUPS) {
    const [row] = await db
      .insert(studentGroups)
      .values({ projectId: project.id, name: g.name, ruleId: ruleIdByName.get(g.ruleName)! })
      .returning({ id: studentGroups.id, name: studentGroups.name });
    groupRows.push({ ...row, studentCount: g.studentCount });
  }

  for (const group of groupRows) {
    const values = Array.from({ length: group.studentCount }, () => {
      const fullName = faker.person.fullName();
      return { projectId: project.id, name: fullName, email: uniqueEmail(fullName), voteStatus: "not_voted" };
    });
    const inserted = await db.insert(students).values(values).returning({ id: students.id });
    await db.insert(studentInGroup).values(
      inserted.map((s) => ({ studentId: s.id, groupId: group.id, projectId: project.id })),
    );
  }

  // Anchor student: overrides their group's rule with a student-level rule,
  // demonstrating students.rule_id taking precedence over student_groups.rule_id.
  const [anchorStudent] = await db
    .insert(students)
    .values({
      projectId: project.id,
      name: "Anna Weber",
      email: uniqueEmail("Anna Weber"),
      voteStatus: "not_voted",
      ruleId: ruleIdByName.get("12er-Rule"),
    })
    .returning({ id: students.id });
  await db.insert(studentInGroup).values({
    studentId: anchorStudent.id,
    groupId: groupRows[0].id,
    projectId: project.id,
  });

  if (scenario.voting !== "none") {
    const allStudents = await db.select({ id: students.id }).from(students).where(eq(students.projectId, project.id));
    const eligibility = await resolveStudentEligibility(db, { projectId: project.id });
    const eligibilityByStudent = new Map(eligibility.map((e) => [e.studentId, e]));

    const votingFraction = scenario.voting === "full" ? 1 : 0.6;
    const shuffled = faker.helpers.shuffle(allStudents);
    const votingCount = Math.round(shuffled.length * votingFraction);
    const voters = shuffled.slice(0, votingCount);
    const nonVoters = shuffled.slice(votingCount);

    for (const s of voters) {
      const elig = eligibilityByStudent.get(s.id);
      if (!elig || elig.eligibleModuleIds.length === 0) continue;
      const rule = elig.ruleId ? ruleFixtureById.get(elig.ruleId) : undefined;
      const targetCount = Math.min(
        elig.eligibleModuleIds.length,
        (rule?.moduleCount ?? 2) + faker.number.int({ min: 2, max: 4 }),
      );

      let pool = elig.eligibleModuleIds.map((id) => ({
        value: id,
        weight: popularityWeightByModuleId.get(id) ?? 1,
      }));
      const picks: string[] = [];
      for (let k = 0; k < targetCount && pool.length > 0; k++) {
        const chosen = faker.helpers.weightedArrayElement(pool);
        picks.push(chosen);
        pool = pool.filter((p) => p.value !== chosen);
      }

      await db.insert(studentPreferences).values(
        picks.map((moduleId, idx) => ({
          studentId: s.id,
          moduleId,
          projectId: project.id,
          preference: idx + 1,
        })),
      );
      await db
        .update(students)
        .set({
          voteStatus: "voted",
          voteOpenedAt: faker.date.recent({ days: 10 }),
          voteSubmittedAt: faker.date.recent({ days: 5 }),
        })
        .where(eq(students.id, s.id));
    }

    // A portion of non-voters "opened" the link but never submitted —
    // exercises voteOpenedAt-without-voteSubmittedAt, distinct from students
    // who never touched it at all.
    for (const s of nonVoters) {
      if (faker.number.float() > 0.5) continue;
      await db.update(students).set({ voteOpenedAt: faker.date.recent({ days: 8 }) }).where(eq(students.id, s.id));
    }
  }

  if (scenario.runAllocation) {
    const { input } = await assembleAllocationInput(db, project.id);
    const result = allocate(input, { prioPercent: 0.2, seed: SEED });
    if (result.assignments.length > 0) {
      await db.insert(studentInModule).values(
        result.assignments.map((a) => ({ studentId: a.studentId, moduleId: a.moduleId, projectId: project.id })),
      );
    }
    console.log(
      `  allocation: ${result.assignments.length} assignments, ${result.issues.length} issues, score ${result.metrics.score.toFixed(1)}`,
    );
  }

  const studentCount = GROUPS.reduce((sum, g) => sum + g.studentCount, 0) + 1;
  console.log(`seeded "${scenario.name}" (${scenario.phase}) — ${studentCount} students`);
}

async function main() {
  await resetDb();
  for (const scenario of SCENARIOS) {
    await seedProject(scenario);
  }
  console.log("done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
