import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { db } from "@modulocate/db";
import {
  renderAttendanceListsPdf,
  renderParticipantListsPdf,
  renderCompactParticipantListsPdf,
  type AttendanceModuleData,
  type ParticipantModuleData,
} from "@modulocate/pdf-export";
import { auth } from "../auth";
import { loadModules, loadModuleRosters } from "../routers/modules";

// Comma-separated `?moduleIds=a,b,c` — omitted means "every module in the
// project". Kept as an explicit filter (unused by the portal UI for now,
// which only offers "export all") so a per-module export can be added later
// without a backend change.
function parseModuleIds(query: unknown): string[] | undefined {
  if (!query || typeof query !== "object") return undefined;
  const raw = (query as Record<string, unknown>).moduleIds;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

type ModuleSortBy = "title" | "teacher" | "schedule";
type SortDir = "asc" | "desc";

function parseSortBy(query: unknown): ModuleSortBy {
  const raw = (query && typeof query === "object" ? (query as Record<string, unknown>).sortBy : undefined) as
    | string
    | undefined;
  return raw === "teacher" || raw === "schedule" ? raw : "title";
}

function parseSortDir(query: unknown): SortDir {
  const raw = (query && typeof query === "object" ? (query as Record<string, unknown>).sortDir : undefined) as
    | string
    | undefined;
  return raw === "desc" ? "desc" : "asc";
}

const WEEKDAY_ORDER: Record<string, number> = { Mo: 1, Di: 2, Mi: 3, Do: 4, Fr: 5, Sa: 6, So: 7 };

// Schedule labels look like "Q1-Mo", sometimes several comma-joined (see
// resolveModuleDisplayScheduleLabels' ", " separator, e.g. "Q1-Mo, Q3-Fr").
// Chronological order means quarter ascending, then the actual school-week
// weekday (Mo < Mi < Fr here) — not alphabetical, which would put "Fr"
// before "Mi" before "Mo". A module with several dates sorts by its
// earliest one. A label that doesn't match "Q<n>-<weekday>" (e.g. a
// free-text scheduleLabel override) falls back to Infinity, so it sorts
// after every parseable label.
function scheduleSortKey(label: string): [number, number] {
  let best: [number, number] | null = null;
  for (const part of label.split(", ")) {
    const match = /^Q(\d+)-(Mo|Di|Mi|Do|Fr|Sa|So)$/.exec(part);
    if (!match) continue;
    const key: [number, number] = [Number(match[1]), WEEKDAY_ORDER[match[2]]];
    if (!best || key[0] < best[0] || (key[0] === best[0] && key[1] < best[1])) best = key;
  }
  return best ?? [Infinity, Infinity];
}

function compareSchedule(a: string, b: string): number {
  const [aQuarter, aWeekday] = scheduleSortKey(a);
  const [bQuarter, bWeekday] = scheduleSortKey(b);
  return aQuarter - bQuarter || aWeekday - bWeekday || a.localeCompare(b);
}

// Nulls always sort to the ascending-first position (so they land last once
// `sortDir === "desc"` reverses the array) — mirrors the convention in
// packages/ui/src/lib/use-table-sort.ts, kept consistent across client and
// server sorting in this codebase.
function sortModuleRows<T extends { name: string; teacher: string | null; displayScheduleLabel: string | null }>(
  rows: T[],
  sortBy: ModuleSortBy,
  sortDir: SortDir,
): T[] {
  const sortValue = (row: T) =>
    sortBy === "teacher" ? row.teacher : sortBy === "schedule" ? row.displayScheduleLabel : row.name;
  const sorted = [...rows].sort((a, b) => {
    const av = sortValue(a);
    const bv = sortValue(b);
    if (av == null && bv == null) return 0;
    if (av == null) return -1;
    if (bv == null) return 1;
    return sortBy === "schedule" ? compareSchedule(av, bv) : av.localeCompare(bv);
  });
  return sortDir === "asc" ? sorted : sorted.reverse();
}

// "en-CA" is a locale trick for a bare YYYY-MM-DD format; Europe/Berlin so
// the date in the filename matches the school's local day, not UTC's (which
// would flip a day early/late around midnight CET/CEST).
function exportDateStamp(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

function exportFilename(base: string): string {
  return `${base}-${exportDateStamp()}.pdf`;
}

// Plain route, not a tRPC procedure, since the response body is a binary PDF
// rather than a JSON-serializable value — so it can't reuse `staffProcedure`
// and duplicates the one-line session check `context.ts` does for tRPC.
async function requireStaffSession(request: FastifyRequest, reply: FastifyReply) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) {
    reply.status(401).send({ error: "Unauthorized" });
    return null;
  }
  return session;
}

export function registerExportRoutes(server: FastifyInstance) {
  server.get("/api/projects/:projectId/exports/attendance-lists.pdf", async (request, reply) => {
    if (!(await requireStaffSession(request, reply))) return;
    const { projectId } = request.params as { projectId: string };
    const moduleIds = parseModuleIds(request.query);
    const sortBy = parseSortBy(request.query);
    const sortDir = parseSortDir(request.query);

    const moduleRows = sortModuleRows(await loadModules(db, projectId, moduleIds), sortBy, sortDir);
    const rosterByModule = await loadModuleRosters(
      db,
      projectId,
      moduleRows.map((module) => module.id),
    );

    const documentModules: AttendanceModuleData[] = moduleRows.map((module) => {
      const roster = [...(rosterByModule.get(module.id) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
      return {
        title: module.name,
        teacher: module.teacher,
        scheduleLabel: module.displayScheduleLabel,
        students: roster.map((row) => ({ name: row.name, groupName: row.groupName })),
      };
    });

    const buffer = await renderAttendanceListsPdf(documentModules);
    reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${exportFilename("anwesenheitslisten")}"`)
      .send(buffer);
  });

  server.get("/api/projects/:projectId/exports/participant-lists.pdf", async (request, reply) => {
    if (!(await requireStaffSession(request, reply))) return;
    const { projectId } = request.params as { projectId: string };
    const moduleIds = parseModuleIds(request.query);
    const sortBy = parseSortBy(request.query);
    const sortDir = parseSortDir(request.query);

    const moduleRows = sortModuleRows(await loadModules(db, projectId, moduleIds), sortBy, sortDir);
    const rosterByModule = await loadModuleRosters(
      db,
      projectId,
      moduleRows.map((module) => module.id),
    );

    const documentModules: ParticipantModuleData[] = moduleRows.map((module) => ({
      title: module.name,
      teacher: module.teacher,
      scheduleLabel: module.displayScheduleLabel,
      studentCount: module.studentCount,
      max: module.max,
      // Already sorted by preference ascending (nulls last) by loadModuleRosters.
      students: (rosterByModule.get(module.id) ?? []).map((row) => ({
        name: row.name,
        groupName: row.groupName,
        preference: row.preference,
      })),
    }));

    const buffer = await renderParticipantListsPdf(documentModules);
    reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${exportFilename("teilnehmerlisten")}"`)
      .send(buffer);
  });

  server.get("/api/projects/:projectId/exports/compact-participant-lists.pdf", async (request, reply) => {
    if (!(await requireStaffSession(request, reply))) return;
    const { projectId } = request.params as { projectId: string };
    const moduleIds = parseModuleIds(request.query);
    const sortBy = parseSortBy(request.query);
    const sortDir = parseSortDir(request.query);

    const moduleRows = sortModuleRows(await loadModules(db, projectId, moduleIds), sortBy, sortDir);
    const rosterByModule = await loadModuleRosters(
      db,
      projectId,
      moduleRows.map((module) => module.id),
    );

    const documentModules: ParticipantModuleData[] = moduleRows.map((module) => ({
      title: module.name,
      teacher: module.teacher,
      scheduleLabel: module.displayScheduleLabel,
      studentCount: module.studentCount,
      max: module.max,
      // Already sorted by preference ascending (nulls last) by loadModuleRosters.
      students: (rosterByModule.get(module.id) ?? []).map((row) => ({
        name: row.name,
        groupName: row.groupName,
        preference: row.preference,
      })),
    }));

    const buffer = await renderCompactParticipantListsPdf(documentModules);
    reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${exportFilename("teilnehmerlisten-kompakt")}"`)
      .send(buffer);
  });
}
