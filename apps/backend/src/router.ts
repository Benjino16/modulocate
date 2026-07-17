import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import {
  dateCreateInput,
  dateUpdateInput,
  moduleCreateInput,
  moduleUpdateInput,
  moduleCategoryCreateInput,
  moduleCategoryUpdateInput,
  ruleCreateInput,
  ruleUpdateInput,
  studentCreateInput,
  studentUpdateInput,
  studentGroupCreateInput,
  studentGroupUpdateInput,
} from "@modulocate/shared";
import { router, publicProcedure } from "./trpc";
import { db } from "./db";
import {
  dates,
  modules,
  moduleCategories,
  rules,
  subRules,
  categoryInSubRule,
  studentGroups,
  studentInGroup,
  students,
  projects,
} from "./db/schema";

// Stopgap until auth/project-context middleware exists: projectId is an
// explicit input instead of being derived from ctx. Once a session carries
// the current project, this merges away and procedures read ctx.projectId.
const projectScoped = z.object({ projectId: z.uuid() });

// Batch-loads rules with their nested sub-rules/categoryIds for a project (or a
// specific subset of rule ids). Two extra queries total, not one per rule.
async function loadRules(projectId: string, ids?: string[]) {
  const ruleRows = await db
    .select()
    .from(rules)
    .where(
      ids
        ? and(eq(rules.projectId, projectId), inArray(rules.id, ids))
        : eq(rules.projectId, projectId),
    );
  if (ruleRows.length === 0) return [];

  const ruleIds = ruleRows.map((rule) => rule.id);
  const subRuleRows = await db.select().from(subRules).where(inArray(subRules.ruleId, ruleIds));

  const subRuleIds = subRuleRows.map((subRule) => subRule.id);
  const categoryRows = subRuleIds.length
    ? await db.select().from(categoryInSubRule).where(inArray(categoryInSubRule.subRuleId, subRuleIds))
    : [];

  const categoryIdsBySubRule = new Map<string, string[]>();
  for (const row of categoryRows) {
    const list = categoryIdsBySubRule.get(row.subRuleId) ?? [];
    list.push(row.categoryId);
    categoryIdsBySubRule.set(row.subRuleId, list);
  }

  const subRulesByRule = new Map<string, { id: string; categoryIds: string[] }[]>();
  for (const subRule of subRuleRows) {
    const list = subRulesByRule.get(subRule.ruleId) ?? [];
    list.push({ id: subRule.id, categoryIds: categoryIdsBySubRule.get(subRule.id) ?? [] });
    subRulesByRule.set(subRule.ruleId, list);
  }

  return ruleRows.map((rule) => ({
    id: rule.id,
    projectId: rule.projectId,
    name: rule.name,
    subRules: subRulesByRule.get(rule.id) ?? [],
  }));
}

// db itself or an open transaction — whatever `db.transaction(async (tx) => ...)` hands back.
type DbExecutor = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

// Attaches each student's "Klasse" (single student_in_group membership, left-
// joined so students without one still come back) — see groupId's comment in
// packages/shared/src/student.ts for why this isn't a plain column. Takes an
// explicit executor (db or an open tx) so callers inside a transaction read
// their own uncommitted writes instead of racing the outer connection.
async function loadStudents(executor: DbExecutor, projectId: string, ids?: string[]) {
  return executor
    .select({
      id: students.id,
      projectId: students.projectId,
      name: students.name,
      email: students.email,
      email2: students.email2,
      signInCode: students.signInCode,
      voteStatus: students.voteStatus,
      ruleId: students.ruleId,
      groupId: studentGroups.id,
      groupName: studentGroups.name,
    })
    .from(students)
    .leftJoin(studentInGroup, eq(studentInGroup.studentId, students.id))
    .leftJoin(studentGroups, eq(studentGroups.id, studentInGroup.groupId))
    .where(
      ids
        ? and(eq(students.projectId, projectId), inArray(students.id, ids))
        : eq(students.projectId, projectId),
    );
}

export const appRouter = router({
  health: publicProcedure.query(() => {
    return { status: "ok" as const };
  }),

  // Stopgap until auth/sessions exist: lists every project so the portal's
  // project switcher has something to select from (see projectScoped above).
  projects: router({
    list: publicProcedure.query(() => db.select().from(projects)),
  }),

  students: router({
    list: publicProcedure.input(projectScoped).query(({ input }) => loadStudents(db, input.projectId)),

    get: publicProcedure
      .input(projectScoped.extend({ id: z.uuid() }))
      .query(async ({ input }) => {
        const [student] = await loadStudents(db, input.projectId, [input.id]);
        if (!student) throw new TRPCError({ code: "NOT_FOUND" });
        return student;
      }),

    create: publicProcedure
      .input(studentCreateInput.and(projectScoped))
      .mutation(async ({ input }) => {
        const { groupId, ...rest } = input;
        return db.transaction(async (tx) => {
          const [student] = await tx
            .insert(students)
            .values({ ...rest, voteStatus: "not_voted" })
            .returning();
          if (groupId) {
            await tx.insert(studentInGroup).values({ studentId: student.id, groupId, projectId: input.projectId });
          }
          const [full] = await loadStudents(tx, input.projectId, [student.id]);
          return full;
        });
      }),

    update: publicProcedure
      .input(studentUpdateInput.and(projectScoped))
      .mutation(async ({ input }) => {
        const { id, projectId, groupId, ...patch } = input;
        return db.transaction(async (tx) => {
          // groupId-only updates leave `patch` empty — drizzle's .set({}) throws,
          // so skip the column update and just confirm the row exists.
          const [student] =
            Object.keys(patch).length > 0
              ? await tx
                  .update(students)
                  .set(patch)
                  .where(and(eq(students.id, id), eq(students.projectId, projectId)))
                  .returning()
              : await tx
                  .select()
                  .from(students)
                  .where(and(eq(students.id, id), eq(students.projectId, projectId)));
          if (!student) throw new TRPCError({ code: "NOT_FOUND" });

          if (groupId !== undefined) {
            await tx
              .delete(studentInGroup)
              .where(and(eq(studentInGroup.studentId, id), eq(studentInGroup.projectId, projectId)));
            if (groupId) {
              await tx.insert(studentInGroup).values({ studentId: id, groupId, projectId });
            }
          }

          const [full] = await loadStudents(tx, projectId, [id]);
          return full;
        });
      }),

    // Hard delete. The student's own group membership is cleared first since
    // "Klasse" is a routine field here (not allocation-engine state) — leaving
    // it would FK-fail every delete for any student with a class set. Still
    // fails with a DB FK error if preferences/eligibility/blocking rows still
    // reference the student — deliberately left as the DB default (no
    // onDelete) rather than guessing a cascade policy; see planning.md.
    remove: publicProcedure
      .input(projectScoped.extend({ id: z.uuid() }))
      .mutation(async ({ input }) => {
        const [student] = await db.transaction(async (tx) => {
          await tx
            .delete(studentInGroup)
            .where(and(eq(studentInGroup.studentId, input.id), eq(studentInGroup.projectId, input.projectId)));
          return tx
            .delete(students)
            .where(and(eq(students.id, input.id), eq(students.projectId, input.projectId)))
            .returning();
        });
        if (!student) throw new TRPCError({ code: "NOT_FOUND" });
        return { id: student.id };
      }),
  }),

  modules: router({
    list: publicProcedure.input(projectScoped).query(({ input }) =>
      db.select().from(modules).where(eq(modules.projectId, input.projectId)),
    ),

    get: publicProcedure
      .input(projectScoped.extend({ id: z.uuid() }))
      .query(async ({ input }) => {
        const [module] = await db
          .select()
          .from(modules)
          .where(and(eq(modules.id, input.id), eq(modules.projectId, input.projectId)));
        if (!module) throw new TRPCError({ code: "NOT_FOUND" });
        return module;
      }),

    create: publicProcedure
      .input(moduleCreateInput.and(projectScoped))
      .mutation(async ({ input }) => {
        const [module] = await db
          .insert(modules)
          .values({ ...input, permanentName: randomUUID() })
          .returning();
        return module;
      }),

    update: publicProcedure
      .input(moduleUpdateInput.and(projectScoped))
      .mutation(async ({ input }) => {
        const { id, projectId, ...patch } = input;
        const [module] = await db
          .update(modules)
          .set(patch)
          .where(and(eq(modules.id, id), eq(modules.projectId, projectId)))
          .returning();
        if (!module) throw new TRPCError({ code: "NOT_FOUND" });
        return module;
      }),

    // Hard delete. Fails with a DB FK error if preferences/eligibility/blocking
    // rows still reference the module — deliberately left as the DB default
    // (no onDelete) rather than guessing a cascade policy; see planning.md.
    remove: publicProcedure
      .input(projectScoped.extend({ id: z.uuid() }))
      .mutation(async ({ input }) => {
        const [module] = await db
          .delete(modules)
          .where(and(eq(modules.id, input.id), eq(modules.projectId, input.projectId)))
          .returning();
        if (!module) throw new TRPCError({ code: "NOT_FOUND" });
        return { id: module.id };
      }),
  }),

  moduleCategories: router({
    list: publicProcedure.input(projectScoped).query(({ input }) =>
      db.select().from(moduleCategories).where(eq(moduleCategories.projectId, input.projectId)),
    ),

    get: publicProcedure
      .input(projectScoped.extend({ id: z.uuid() }))
      .query(async ({ input }) => {
        const [category] = await db
          .select()
          .from(moduleCategories)
          .where(and(eq(moduleCategories.id, input.id), eq(moduleCategories.projectId, input.projectId)));
        if (!category) throw new TRPCError({ code: "NOT_FOUND" });
        return category;
      }),

    create: publicProcedure
      .input(moduleCategoryCreateInput.and(projectScoped))
      .mutation(async ({ input }) => {
        const [category] = await db.insert(moduleCategories).values(input).returning();
        return category;
      }),

    update: publicProcedure
      .input(moduleCategoryUpdateInput.and(projectScoped))
      .mutation(async ({ input }) => {
        const { id, projectId, ...patch } = input;
        const [category] = await db
          .update(moduleCategories)
          .set(patch)
          .where(and(eq(moduleCategories.id, id), eq(moduleCategories.projectId, projectId)))
          .returning();
        if (!category) throw new TRPCError({ code: "NOT_FOUND" });
        return category;
      }),

    // Hard delete. Fails with a DB FK error if modules/sub-rules/blocking rows
    // still reference the category — same reasoning as modules.remove above.
    remove: publicProcedure
      .input(projectScoped.extend({ id: z.uuid() }))
      .mutation(async ({ input }) => {
        const [category] = await db
          .delete(moduleCategories)
          .where(and(eq(moduleCategories.id, input.id), eq(moduleCategories.projectId, input.projectId)))
          .returning();
        if (!category) throw new TRPCError({ code: "NOT_FOUND" });
        return { id: category.id };
      }),
  }),

  dates: router({
    list: publicProcedure.input(projectScoped).query(({ input }) =>
      db.select().from(dates).where(eq(dates.projectId, input.projectId)),
    ),

    get: publicProcedure
      .input(projectScoped.extend({ id: z.uuid() }))
      .query(async ({ input }) => {
        const [date] = await db
          .select()
          .from(dates)
          .where(and(eq(dates.id, input.id), eq(dates.projectId, input.projectId)));
        if (!date) throw new TRPCError({ code: "NOT_FOUND" });
        return date;
      }),

    create: publicProcedure
      .input(dateCreateInput.and(projectScoped))
      .mutation(async ({ input }) => {
        const [date] = await db.insert(dates).values(input).returning();
        return date;
      }),

    update: publicProcedure
      .input(dateUpdateInput.and(projectScoped))
      .mutation(async ({ input }) => {
        const { id, projectId, ...patch } = input;
        const [date] = await db
          .update(dates)
          .set(patch)
          .where(and(eq(dates.id, id), eq(dates.projectId, projectId)))
          .returning();
        if (!date) throw new TRPCError({ code: "NOT_FOUND" });
        return date;
      }),

    // Hard delete. Fails with a DB FK error if modules/blocking rows still
    // reference the date — same reasoning as modules.remove above.
    remove: publicProcedure
      .input(projectScoped.extend({ id: z.uuid() }))
      .mutation(async ({ input }) => {
        const [date] = await db
          .delete(dates)
          .where(and(eq(dates.id, input.id), eq(dates.projectId, input.projectId)))
          .returning();
        if (!date) throw new TRPCError({ code: "NOT_FOUND" });
        return { id: date.id };
      }),
  }),

  rules: router({
    list: publicProcedure.input(projectScoped).query(({ input }) => loadRules(input.projectId)),

    get: publicProcedure
      .input(projectScoped.extend({ id: z.uuid() }))
      .query(async ({ input }) => {
        const [rule] = await loadRules(input.projectId, [input.id]);
        if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
        return rule;
      }),

    create: publicProcedure
      .input(ruleCreateInput.and(projectScoped))
      .mutation(async ({ input }) => {
        return db.transaction(async (tx) => {
          const [rule] = await tx
            .insert(rules)
            .values({ projectId: input.projectId, name: input.name })
            .returning();

          const insertedSubRules = await tx
            .insert(subRules)
            .values(input.subRules.map(() => ({ ruleId: rule.id, projectId: input.projectId })))
            .returning();

          const categoryRows = insertedSubRules.flatMap((subRule, i) =>
            input.subRules[i].categoryIds.map((categoryId) => ({
              subRuleId: subRule.id,
              categoryId,
              projectId: input.projectId,
            })),
          );
          if (categoryRows.length > 0) {
            await tx.insert(categoryInSubRule).values(categoryRows);
          }

          return {
            id: rule.id,
            projectId: rule.projectId,
            name: rule.name,
            subRules: insertedSubRules.map((subRule, i) => ({
              id: subRule.id,
              categoryIds: input.subRules[i].categoryIds,
            })),
          };
        });
      }),

    // Replaces the whole sub-rule set when `subRules` is provided (see
    // ruleUpdateInput's comment in packages/shared) rather than diffing
    // individual sub-rules — deleting cascades to category_in_sub_rule.
    update: publicProcedure
      .input(ruleUpdateInput.and(projectScoped))
      .mutation(async ({ input }) => {
        return db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(rules)
            .where(and(eq(rules.id, input.id), eq(rules.projectId, input.projectId)));
          if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

          const name = input.name ?? existing.name;
          if (input.name !== undefined) {
            await tx.update(rules).set({ name }).where(eq(rules.id, input.id));
          }

          if (!input.subRules) {
            const [unchanged] = await loadRules(input.projectId, [input.id]);
            return { ...unchanged, name };
          }

          await tx.delete(subRules).where(eq(subRules.ruleId, input.id));

          const insertedSubRules = await tx
            .insert(subRules)
            .values(input.subRules.map(() => ({ ruleId: input.id, projectId: input.projectId })))
            .returning();

          const categoryRows = insertedSubRules.flatMap((subRule, i) =>
            input.subRules![i].categoryIds.map((categoryId) => ({
              subRuleId: subRule.id,
              categoryId,
              projectId: input.projectId,
            })),
          );
          if (categoryRows.length > 0) {
            await tx.insert(categoryInSubRule).values(categoryRows);
          }

          return {
            id: input.id,
            projectId: input.projectId,
            name,
            subRules: insertedSubRules.map((subRule, i) => ({
              id: subRule.id,
              categoryIds: input.subRules![i].categoryIds,
            })),
          };
        });
      }),

    // Hard delete — rules have no soft-delete field in db_planning.md. Cascades
    // to sub_rules/category_in_sub_rule; groups/students referencing this rule
    // just fall back to null (see schema.ts onDelete: "set null").
    remove: publicProcedure
      .input(projectScoped.extend({ id: z.uuid() }))
      .mutation(async ({ input }) => {
        const [rule] = await db
          .delete(rules)
          .where(and(eq(rules.id, input.id), eq(rules.projectId, input.projectId)))
          .returning();
        if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
        return { id: rule.id };
      }),
  }),

  studentGroups: router({
    list: publicProcedure.input(projectScoped).query(({ input }) =>
      db.select().from(studentGroups).where(eq(studentGroups.projectId, input.projectId)),
    ),

    get: publicProcedure
      .input(projectScoped.extend({ id: z.uuid() }))
      .query(async ({ input }) => {
        const [group] = await db
          .select()
          .from(studentGroups)
          .where(and(eq(studentGroups.id, input.id), eq(studentGroups.projectId, input.projectId)));
        if (!group) throw new TRPCError({ code: "NOT_FOUND" });
        return group;
      }),

    create: publicProcedure
      .input(studentGroupCreateInput.and(projectScoped))
      .mutation(async ({ input }) => {
        const [group] = await db.insert(studentGroups).values(input).returning();
        return group;
      }),

    update: publicProcedure
      .input(studentGroupUpdateInput.and(projectScoped))
      .mutation(async ({ input }) => {
        const { id, projectId, ...patch } = input;
        const [group] = await db
          .update(studentGroups)
          .set(patch)
          .where(and(eq(studentGroups.id, id), eq(studentGroups.projectId, projectId)))
          .returning();
        if (!group) throw new TRPCError({ code: "NOT_FOUND" });
        return group;
      }),

    // Hard delete, no soft-delete field on student_groups. Fails with a DB FK
    // error if students/blocking rows still reference the group — deliberately
    // left as the DB default (no onDelete) rather than guessing a cascade
    // policy before group-membership/blocking CRUD exists.
    remove: publicProcedure
      .input(projectScoped.extend({ id: z.uuid() }))
      .mutation(async ({ input }) => {
        const [group] = await db
          .delete(studentGroups)
          .where(and(eq(studentGroups.id, input.id), eq(studentGroups.projectId, input.projectId)))
          .returning();
        if (!group) throw new TRPCError({ code: "NOT_FOUND" });
        return { id: group.id };
      }),
  }),
});

export type AppRouter = typeof appRouter;