import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { allocationRunCreateInput } from "@modulocate/shared";
import { db, modules, students, studentInModule } from "@modulocate/db";
import {
  AllocationJobName,
  createAllocationRun,
  deleteAllocationRun,
  getAllocationQueue,
  getAllocationRun,
  listAllocationRuns,
  type AllocationRunRecord,
} from "@modulocate/queue";
import { router, publicProcedure } from "../trpc";
import { projectScoped } from "./shared";

// Tile-list shape: everything but the (potentially large) assignments/issues
// payload, plus derived counts the portal's warning icons need. The full,
// name-enriched record is only fetched by `get`, for the run-detail dialog.
function toSummary(run: AllocationRunRecord) {
  const { result, ...rest } = run;
  return {
    ...rest,
    metrics: result
      ? {
          score: result.metrics.score,
          unassignedCount: result.metrics.unassignedCount,
          ruleViolationCount: result.metrics.ruleViolationCount,
          belowMinCapacityCount: result.issues.filter((issue) => issue.type === "below_min_capacity").length,
        }
      : undefined,
  };
}

// The engine only knows ids (packages/allocation-engine stays DB-free by
// design, see planning.md Architectural Principle 5) — the detail dialog
// needs readable names, so this joins each issue against students/modules by
// the id it already carries. A handful of extra queries total, not one per
// issue.
async function enrichIssues(issues: NonNullable<AllocationRunRecord["result"]>["issues"]) {
  const studentIds = [...new Set(issues.flatMap((issue) => (issue.type === "below_min_capacity" ? [] : [issue.studentId])))];
  const moduleIds = [...new Set(issues.flatMap((issue) => (issue.type === "below_min_capacity" ? [issue.moduleId] : [])))];

  const [studentRows, moduleRows] = await Promise.all([
    studentIds.length
      ? db.select({ id: students.id, name: students.name }).from(students).where(inArray(students.id, studentIds))
      : [],
    moduleIds.length
      ? db.select({ id: modules.id, name: modules.name }).from(modules).where(inArray(modules.id, moduleIds))
      : [],
  ]);

  const studentNameById = new Map(studentRows.map((s) => [s.id, s.name]));
  const moduleNameById = new Map(moduleRows.map((m) => [m.id, m.name]));

  return issues.map((issue) =>
    issue.type === "below_min_capacity"
      ? { ...issue, moduleName: moduleNameById.get(issue.moduleId) ?? "Unbekanntes Modul" }
      : { ...issue, studentName: studentNameById.get(issue.studentId) ?? "Unbekannt" },
  );
}

export const allocationRunsRouter = router({
  list: publicProcedure.input(projectScoped).query(async ({ input }) => {
    const runs = await listAllocationRuns(input.projectId);
    return runs.map(toSummary);
  }),

  // Full detail for the run-detail dialog: same metrics as the tile, plus
  // every issue joined with the student/module name it refers to. Doesn't
  // return `assignments` — `load` reads those straight from Redis when it
  // actually needs them, the dialog never does.
  get: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .query(async ({ input }) => {
      const run = await getAllocationRun(input.projectId, input.id);
      if (!run) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        ...toSummary(run),
        issues: run.result ? await enrichIssues(run.result.issues) : [],
      };
    }),

  // Writes the run record with status "running" synchronously (so the tile
  // shows up on the portal immediately) before handing the actual
  // computation off to the worker via BullMQ.
  start: publicProcedure
    .input(allocationRunCreateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      const id = randomUUID();
      const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
      const createdAt = new Date().toISOString();

      await createAllocationRun({
        id,
        projectId: input.projectId,
        createdAt,
        status: "running",
        config: { prioPercent: input.prioPercent, seed },
      });

      await getAllocationQueue().add(AllocationJobName.Run, {
        projectId: input.projectId,
        runId: id,
        prioPercent: input.prioPercent,
        seed,
      });

      return { id };
    }),

  remove: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      const deleted = await deleteAllocationRun(input.projectId, input.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: input.id };
    }),

  // Planning.md Phase 4: "the admin selects a run from Redis ... and loads
  // it into the production DB". Completely replaces student_in_module for
  // this project — the portal warns the admin before calling this, since
  // any manual corrections already made are lost.
  load: publicProcedure
    .input(projectScoped.extend({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      const run = await getAllocationRun(input.projectId, input.id);
      if (!run) throw new TRPCError({ code: "NOT_FOUND" });
      if (run.status !== "completed" || !run.result) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Nur abgeschlossene Durchläufe können geladen werden.",
        });
      }

      const assignments = run.result.assignments;
      await db.transaction(async (tx) => {
        await tx.delete(studentInModule).where(eq(studentInModule.projectId, input.projectId));
        if (assignments.length > 0) {
          await tx.insert(studentInModule).values(
            assignments.map((assignment) => ({
              studentId: assignment.studentId,
              moduleId: assignment.moduleId,
              projectId: input.projectId,
            })),
          );
        }
      });

      return { assignedCount: assignments.length };
    }),
});
