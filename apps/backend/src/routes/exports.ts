import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { db } from "@modulocate/db";
import {
  renderAttendanceListsPdf,
  renderParticipantListsPdf,
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

    const moduleRows = await loadModules(db, projectId, moduleIds);
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
      .header("Content-Disposition", 'attachment; filename="anwesenheitslisten.pdf"')
      .send(buffer);
  });

  server.get("/api/projects/:projectId/exports/participant-lists.pdf", async (request, reply) => {
    if (!(await requireStaffSession(request, reply))) return;
    const { projectId } = request.params as { projectId: string };
    const moduleIds = parseModuleIds(request.query);

    const moduleRows = await loadModules(db, projectId, moduleIds);
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
      .header("Content-Disposition", 'attachment; filename="teilnehmerlisten.pdf"')
      .send(buffer);
  });
}
