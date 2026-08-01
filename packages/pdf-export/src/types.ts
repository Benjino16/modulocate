export type ModuleHeaderData = {
  title: string;
  teacher: string | null;
  scheduleLabel: string | null;
};

export type AttendanceModuleData = ModuleHeaderData & {
  students: { name: string; groupName: string | null }[];
};

export type ParticipantModuleData = ModuleHeaderData & {
  studentCount: number;
  max: number;
  students: { name: string; groupName: string | null; preference: number | null }[];
};
