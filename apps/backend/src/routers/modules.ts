import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { moduleCreateInput, moduleUpdateInput } from "@modulocate/shared";
import {
  db,
  modules,
  moduleInCategory,
  moduleInDate,
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
import { sanitizeModuleDescription } from "../lib/sanitize";

// Batch-loads modules with their categoryIds (module_in_category) for a
// project (or a specific subset of module ids). Takes an explicit executor so
// callers inside a transaction can pass `tx` and see their own uncommitted writes.
async function loadModules(executor: DbExecutor, projectId: string, ids?: string[]) {
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

  create: staffProcedure
    .input(moduleCreateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const { categoryIds, dateIds, ...fields } = input;
        if (fields.description !== undefined) {
          fields.description = sanitizeModuleDescription(fields.description);
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
          patch.description = sanitizeModuleDescription(patch.description);
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

  // Hard delete. Fails with a DB FK error if preferences/eligibility/blocking
  // rows still reference the module — deliberately left as the DB default
  // (no onDelete) rather than guessing a cascade policy; see planning.md.
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
