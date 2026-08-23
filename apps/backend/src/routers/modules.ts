import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { moduleCreateInput, moduleUpdateInput, moduleImportFile } from "@modulocate/shared";
import {
  db,
  modules,
  moduleInCategory,
  moduleInDate,
  moduleCategories,
  dates,
  studentInModule,
  students,
  rules,
  studentGroups,
  studentInGroup,
  studentPreferences,
  resolveModuleDisplayScheduleLabels,
  type DbExecutor,
} from "@modulocate/db";
import { router, staffProcedure } from "../trpc";
import { projectScoped } from "./shared";
import { sanitizeRichText } from "../lib/sanitize";

// Batch-loads modules with their categoryIds (module_in_category) for a
// project (or a specific subset of module ids). Takes an explicit executor so
// callers inside a transaction can pass `tx` and see their own uncommitted writes.
// Exported for the PDF export routes (routes/exports.ts), which reuse it for
// module headers (title/teacher/displayScheduleLabel/studentCount/max).
export async function loadModules(executor: DbExecutor, projectId: string, ids?: string[]) {
  const moduleRows = await executor
    .select()
    .from(modules)
    .where(
      ids
        ? and(eq(modules.projectId, projectId), inArray(modules.id, ids))
        : eq(modules.projectId, projectId),
    );
  if (moduleRows.length === 0) return [];

  const moduleIds = moduleRows.map((module) => module.id);
  const categoryRows = await executor
    .select()
    .from(moduleInCategory)
    .where(inArray(moduleInCategory.moduleId, moduleIds));

  const categoryIdsByModule = new Map<string, string[]>();
  for (const row of categoryRows) {
    const list = categoryIdsByModule.get(row.moduleId) ?? [];
    list.push(row.categoryId);
    categoryIdsByModule.set(row.moduleId, list);
  }

  const dateRows = await executor.select().from(moduleInDate).where(inArray(moduleInDate.moduleId, moduleIds));

  const dateIdsByModule = new Map<string, string[]>();
  for (const row of dateRows) {
    const list = dateIdsByModule.get(row.moduleId) ?? [];
    list.push(row.dateId);
    dateIdsByModule.set(row.moduleId, list);
  }

  const displayScheduleLabelByModule = await resolveModuleDisplayScheduleLabels(executor, moduleIds);

  const studentRows = await executor
    .select({ moduleId: studentInModule.moduleId, studentId: studentInModule.studentId })
    .from(studentInModule)
    .where(inArray(studentInModule.moduleId, moduleIds));

  const studentCountByModule = new Map<string, number>();
  const assignedStudentIdsByModule = new Map<string, Set<string>>();
  for (const row of studentRows) {
    studentCountByModule.set(row.moduleId, (studentCountByModule.get(row.moduleId) ?? 0) + 1);
    const set = assignedStudentIdsByModule.get(row.moduleId) ?? new Set<string>();
    set.add(row.studentId);
    assignedStudentIdsByModule.set(row.moduleId, set);
  }

  // Median (not mean) preference rank among students actually assigned to the
  // module — robust against a handful of low-ranked filler/manual assignments
  // skewing the picture, unlike a plain average. Only counts students with a
  // recorded preference for this module; manual assignments without one are
  // left out of the calculation entirely rather than skewing it as "unranked".
  const preferenceRows = await executor
    .select({
      moduleId: studentPreferences.moduleId,
      studentId: studentPreferences.studentId,
      preference: studentPreferences.preference,
    })
    .from(studentPreferences)
    .where(inArray(studentPreferences.moduleId, moduleIds));

  const assignedPreferencesByModule = new Map<string, number[]>();
  for (const row of preferenceRows) {
    if (!assignedStudentIdsByModule.get(row.moduleId)?.has(row.studentId)) continue;
    const list = assignedPreferencesByModule.get(row.moduleId) ?? [];
    list.push(row.preference);
    assignedPreferencesByModule.set(row.moduleId, list);
  }

  return moduleRows.map((module) => ({
    ...module,
    categoryIds: categoryIdsByModule.get(module.id) ?? [],
    dateIds: dateIdsByModule.get(module.id) ?? [],
    // Default display label when scheduleLabel wasn't explicitly set.
    // `scheduleLabel` itself stays as stored (null when unset) so the edit
    // dialog can still tell "unset" apart from "explicitly typed".
    displayScheduleLabel: module.scheduleLabel || displayScheduleLabelByModule.get(module.id) || null,
    studentCount: studentCountByModule.get(module.id) ?? 0,
    medianPreference: median(assignedPreferencesByModule.get(module.id) ?? []),
  }));
}

// Batched sibling of the `roster` procedure below, for the PDF export routes:
// same join shape (studentInModule -> students -> left join group/rule ->
// left join preference), but resolved for many modules in one round trip
// instead of once per module, then grouped by moduleId in JS. Avoids N+1
// queries when exporting a whole project's worth of modules at once.
export async function loadModuleRosters(executor: DbExecutor, projectId: string, moduleIds: string[]) {
  const rowsByModule = new Map<string, Awaited<ReturnType<typeof selectRosterRows>>>();
  if (moduleIds.length === 0) return rowsByModule;

  const rows = await selectRosterRows(executor, projectId, moduleIds);
  for (const row of rows) {
    const list = rowsByModule.get(row.moduleId) ?? [];
    list.push(row);
    rowsByModule.set(row.moduleId, list);
  }
  for (const list of rowsByModule.values()) {
    list.sort((a, b) => (a.preference ?? Infinity) - (b.preference ?? Infinity));
  }
  return rowsByModule;
}

function selectRosterRows(executor: DbExecutor, projectId: string, moduleIds: string[]) {
  return executor
    .select({
      moduleId: studentInModule.moduleId,
      studentId: students.id,
      name: students.name,
      groupName: studentGroups.name,
      preference: studentPreferences.preference,
    })
    .from(studentInModule)
    .innerJoin(students, eq(students.id, studentInModule.studentId))
    .leftJoin(studentInGroup, eq(studentInGroup.studentId, students.id))
    .leftJoin(studentGroups, eq(studentGroups.id, studentInGroup.groupId))
    .leftJoin(
      studentPreferences,
      and(
        eq(studentPreferences.studentId, students.id),
        eq(studentPreferences.moduleId, studentInModule.moduleId),
      ),
    )
    .where(and(inArray(studentInModule.moduleId, moduleIds), eq(studentInModule.projectId, projectId)));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const modulesRouter = router({
  list: staffProcedure.input(projectScoped).query(({ input }) => loadModules(db, input.projectId)),

  get: staffProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .query(async ({ input }) => {
      const [module] = await loadModules(db, input.projectId, [input.id]);
      if (!module) throw new TRPCError({ code: "NOT_FOUND" });
      return module;
    }),

  // Data > Module bulk export: the whole project's modules with categories/
  // dates resolved to name strings (see moduleImportFile in @modulocate/shared
  // for why) instead of the ids `list` returns. Round-trips through
  // importBatch below.
  exportAll: staffProcedure.input(projectScoped).query(async ({ input }) => {
    const [moduleRows, categoryRows, dateRows] = await Promise.all([
      loadModules(db, input.projectId),
      db.select().from(moduleCategories).where(eq(moduleCategories.projectId, input.projectId)),
      db.select().from(dates).where(eq(dates.projectId, input.projectId)),
    ]);

    const categoryNameById = new Map(categoryRows.map((category) => [category.id, category.name]));
    const dateNameById = new Map(dateRows.map((date) => [date.id, date.name]));

    return {
      version: 1 as const,
      modules: moduleRows.map((module) => ({
        name: module.name,
        description: module.description,
        teacher: module.teacher,
        scheduleLabel: module.scheduleLabel,
        min: module.min,
        max: module.max,
        categoryNames: module.categoryIds.map((id) => categoryNameById.get(id)!).filter(Boolean),
        dateNames: module.dateIds.map((id) => dateNameById.get(id)!).filter(Boolean),
      })),
    };
  }),

  // Data > Module bulk import: always creates new modules, never matches/
  // updates an existing one by name (module name has no uniqueness
  // constraint, so "same name" isn't a reliable identity — see planning
  // discussion). Categories/dates are resolved by name: first existing match
  // wins on a name collision, a name with no match gets created. One
  // transaction for the whole file — a single invalid/failing module rolls
  // back the entire import rather than leaving a partial result.
  importBatch: staffProcedure
    .input(moduleImportFile.and(projectScoped))
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const [existingCategories, existingDates] = await Promise.all([
          tx.select().from(moduleCategories).where(eq(moduleCategories.projectId, input.projectId)),
          tx.select().from(dates).where(eq(dates.projectId, input.projectId)),
        ]);

        // First name wins on duplicates, matching the export/import name-
        // conflict rule for categories and dates alike.
        const categoryIdByName = new Map<string, string>();
        for (const category of existingCategories) {
          if (!categoryIdByName.has(category.name)) categoryIdByName.set(category.name, category.id);
        }
        const dateIdByName = new Map<string, string>();
        for (const date of existingDates) {
          if (!dateIdByName.has(date.name)) dateIdByName.set(date.name, date.id);
        }

        async function resolveCategoryId(name: string) {
          const existingId = categoryIdByName.get(name);
          if (existingId) return existingId;
          const [created] = await tx.insert(moduleCategories).values({ projectId: input.projectId, name }).returning();
          categoryIdByName.set(name, created.id);
          return created.id;
        }

        async function resolveDateId(name: string) {
          const existingId = dateIdByName.get(name);
          if (existingId) return existingId;
          const [created] = await tx.insert(dates).values({ projectId: input.projectId, name }).returning();
          dateIdByName.set(name, created.id);
          return created.id;
        }

        const createdIds: string[] = [];
        for (const entry of input.modules) {
          const categoryIds: string[] = [];
          for (const name of entry.categoryNames) categoryIds.push(await resolveCategoryId(name));
          const dateIds: string[] = [];
          for (const name of entry.dateNames) dateIds.push(await resolveDateId(name));

          const [module] = await tx
            .insert(modules)
            .values({
              projectId: input.projectId,
              permanentName: randomUUID(),
              name: entry.name,
              description: entry.description ? sanitizeRichText(entry.description) : null,
              teacher: entry.teacher || null,
              scheduleLabel: entry.scheduleLabel || null,
              min: entry.min,
              max: entry.max,
            })
            .returning();

          if (categoryIds.length > 0) {
            await tx.insert(moduleInCategory).values(
              categoryIds.map((categoryId) => ({ moduleId: module.id, categoryId, projectId: input.projectId })),
            );
          }
          if (dateIds.length > 0) {
            await tx.insert(moduleInDate).values(
              dateIds.map((dateId) => ({ moduleId: module.id, dateId, projectId: input.projectId })),
            );
          }
          createdIds.push(module.id);
        }

        return loadModules(tx, input.projectId, createdIds);
      });
    }),

  create: staffProcedure
    .input(moduleCreateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const { categoryIds, dateIds, ...fields } = input;
        if (fields.description !== undefined) {
          fields.description = sanitizeRichText(fields.description);
        }
        const [module] = await tx
          .insert(modules)
          .values({ ...fields, permanentName: randomUUID() })
          .returning();

        if (categoryIds.length > 0) {
          await tx.insert(moduleInCategory).values(
            categoryIds.map((categoryId) => ({
              moduleId: module.id,
              categoryId,
              projectId: input.projectId,
            })),
          );
        }

        if (dateIds.length > 0) {
          await tx.insert(moduleInDate).values(
            dateIds.map((dateId) => ({
              moduleId: module.id,
              dateId,
              projectId: input.projectId,
            })),
          );
        }

        const [created] = await loadModules(tx, input.projectId, [module.id]);
        return created;
      });
    }),

  // Replaces the whole category/date set when `categoryIds`/`dateIds` is
  // provided, same full-replace convention as rules.subRules/blockedCategoryIds.
  update: staffProcedure
    .input(moduleUpdateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const { id, projectId, categoryIds, dateIds, ...patch } = input;
        if (typeof patch.description === "string") {
          patch.description = sanitizeRichText(patch.description);
        }

        const [existing] = await tx
          .select()
          .from(modules)
          .where(and(eq(modules.id, id), eq(modules.projectId, projectId)));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

        if (Object.keys(patch).length > 0) {
          await tx.update(modules).set(patch).where(eq(modules.id, id));
        }

        if (categoryIds) {
          await tx.delete(moduleInCategory).where(eq(moduleInCategory.moduleId, id));
          if (categoryIds.length > 0) {
            await tx.insert(moduleInCategory).values(
              categoryIds.map((categoryId) => ({ moduleId: id, categoryId, projectId })),
            );
          }
        }

        if (dateIds) {
          await tx.delete(moduleInDate).where(eq(moduleInDate.moduleId, id));
          if (dateIds.length > 0) {
            await tx.insert(moduleInDate).values(
              dateIds.map((dateId) => ({ moduleId: id, dateId, projectId })),
            );
          }
        }

        const [module] = await loadModules(tx, projectId, [id]);
        return module;
      });
    }),

  // Students assigned to the module, each with their vote preference for
  // this module (null if they got in without ever ranking it, e.g. a manual
  // assignment) and their class/rule-override, for the roster dialog.
  // Sorted in JS, not SQL — preference is nullable and the roster is always
  // small, so a NULLS-LAST order-by isn't worth the query complexity.
  roster: staffProcedure
    .input(projectScoped.extend({ moduleId: z.uuid() }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          studentId: students.id,
          name: students.name,
          ruleId: students.ruleId,
          ruleName: rules.name,
          groupName: studentGroups.name,
          preference: studentPreferences.preference,
        })
        .from(studentInModule)
        .innerJoin(students, eq(students.id, studentInModule.studentId))
        .leftJoin(rules, eq(rules.id, students.ruleId))
        .leftJoin(studentInGroup, eq(studentInGroup.studentId, students.id))
        .leftJoin(studentGroups, eq(studentGroups.id, studentInGroup.groupId))
        .leftJoin(
          studentPreferences,
          and(
            eq(studentPreferences.studentId, students.id),
            eq(studentPreferences.moduleId, studentInModule.moduleId),
          ),
        )
        .where(and(eq(studentInModule.moduleId, input.moduleId), eq(studentInModule.projectId, input.projectId)));

      return rows.sort((a, b) => (a.preference ?? Infinity) - (b.preference ?? Infinity));
    }),

  // Manually assigns one student to the module (e.g. from the Anpassungen
  // student dialog) without touching their preferences. Capacity is
  // deliberately not enforced here — manual assignment is explicitly allowed
  // to push a module past its max (see planning.md), same as the allocator
  // itself never hard-blocks on it. onConflictDoNothing guards the rare
  // double-submit race against student_in_module's composite primary key.
  addStudent: staffProcedure
    .input(projectScoped.extend({ moduleId: z.uuid(), studentId: z.uuid() }))
    .mutation(async ({ input }) => {
      await db
        .insert(studentInModule)
        .values({ moduleId: input.moduleId, studentId: input.studentId, projectId: input.projectId })
        .onConflictDoNothing();
      return { success: true as const };
    }),

  // Removes one student from the module (e.g. a manual correction in the
  // Anpassungen roster view) without touching their preferences.
  removeStudent: staffProcedure
    .input(projectScoped.extend({ moduleId: z.uuid(), studentId: z.uuid() }))
    .mutation(async ({ input }) => {
      await db
        .delete(studentInModule)
        .where(
          and(
            eq(studentInModule.moduleId, input.moduleId),
            eq(studentInModule.studentId, input.studentId),
            eq(studentInModule.projectId, input.projectId),
          ),
        );
      return { success: true as const };
    }),

  // Hard delete. moduleInCategory/moduleInDate rows cascade automatically
  // (pure join rows with no independent meaning). Still fails with a DB FK
  // error if student preferences/eligibility/blocking rows reference the
  // module — deliberately left as the DB default there; see planning.md.
  remove: staffProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      const [module] = await db
        .delete(modules)
        .where(and(eq(modules.id, input.id), eq(modules.projectId, input.projectId)))
        .returning();
      if (!module) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: module.id };
    }),
});
