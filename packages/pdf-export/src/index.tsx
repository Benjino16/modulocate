import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { AttendanceListDocument } from "./documents/AttendanceListDocument";
import { ParticipantListDocument } from "./documents/ParticipantListDocument";
import { CompactParticipantListDocument } from "./documents/CompactParticipantListDocument";
import { StudentListDocument } from "./documents/StudentListDocument";
import type { AttendanceModuleData, ParticipantModuleData, StudentListData } from "./types";

export type {
  ModuleHeaderData,
  AttendanceModuleData,
  ParticipantModuleData,
  StudentListModuleData,
  StudentListData,
} from "./types";

export function renderAttendanceListsPdf(modules: AttendanceModuleData[]): Promise<Buffer> {
  return renderToBuffer(<AttendanceListDocument modules={modules} />);
}

export function renderParticipantListsPdf(modules: ParticipantModuleData[]): Promise<Buffer> {
  return renderToBuffer(<ParticipantListDocument modules={modules} />);
}

export function renderCompactParticipantListsPdf(modules: ParticipantModuleData[]): Promise<Buffer> {
  return renderToBuffer(<CompactParticipantListDocument modules={modules} />);
}

export function renderStudentListsPdf(students: StudentListData[]): Promise<Buffer> {
  return renderToBuffer(<StudentListDocument students={students} />);
}
