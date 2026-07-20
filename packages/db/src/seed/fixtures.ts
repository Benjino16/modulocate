// Hand-authored reference data for the seed script (see seed/index.ts).
// Deliberately structured as plain data, not code, so it's easy to swap
// individual entries for real (anonymized) values later without touching
// any of the seeding logic — e.g. once the real historical dataset from
// last year is properly anonymized, its modules could replace the ones
// below one-for-one.

export const CATEGORIES = [
  "Sport",
  "Darstellendes Spiel",
  "Informatik",
  "Bio/ChemieTech",
  "Sprachen & Musik",
  "Sozialkunde",
] as const;

// A native enum (not the Zod-enum pattern used elsewhere in this repo, e.g.
// packages/shared/src/project.ts's projectPhase) — this is pure fixture-
// authoring data, never crosses a validation boundary, so the dot-access
// ergonomics (Dates.Q1_MO instead of DATE_LABELS[3]) win here without the
// downsides that make native enums a bad fit for API-facing types.
export enum Dates {
  Q1_MO = "Q1-Mo",
  Q1_MI = "Q1-Mi",
  Q1_FR = "Q1-Fr",
  Q2_MO = "Q2-Mo",
  Q2_MI = "Q2-Mi",
  Q2_FR = "Q2-Fr",
  Q3_MO = "Q3-Mo",
  Q3_MI = "Q3-Mi",
  Q3_FR = "Q3-Fr",
  Q4_MO = "Q4-Mo",
  Q4_MI = "Q4-Mi",
  Q4_FR = "Q4-Fr",
}

// Derived from the enum, not hand-duplicated — single source of truth for
// "every date slot that exists", used by seed/index.ts to create the `dates`
// rows.
export const DATE_LABELS = Object.values(Dates);

// UI-only grouping buckets (modules.date_sort_id -> date_sort_tags), one per
// quarter, deliberately coarser than Dates itself — see dateSortTags's
// comment in schema.ts ("all Q1 modules" regardless of weekday).
export const DATE_SORT_TAGS = ["Q1", "Q2", "Q3", "Q4"] as const;

function quarterOf(date: Dates): (typeof DATE_SORT_TAGS)[number] {
  return date.split("-")[0] as (typeof DATE_SORT_TAGS)[number];
}

// "popularity" drives synthetic vote weighting (seed/index.ts) — not a real
// column. High-popularity + low max is what produces realistic overbooking;
// low-popularity + a min that isn't trivially small is what produces
// below-min-capacity modules. Both are worth having a few of so the demo
// data actually exercises those states.
export type Popularity = "high" | "medium" | "low";

export const POPULARITY_WEIGHT: Record<Popularity, number> = {
  high: 6,
  medium: 3,
  low: 1,
};

export interface ModuleFixture {
  name: string;
  teacher: string;
  categories: readonly (typeof CATEGORIES)[number][];
  min: number;
  max: number;
  // A module can meet on more than one date — module_in_date is a many-to-
  // many table (e.g. a module that runs both Q1 and Q2 on the same weekday).
  // Not used by the portal UI yet, but it's what the allocation engine's
  // date-blocking (rule_blocked_date) actually reasons over, so seed data
  // should populate it correctly even ahead of the UI.
  // Omit (or leave empty) for a module that has no date at all — that's a
  // real, valid case: not every module participates in date-based blocking.
  // There is no auto-assignment here on purpose; unlike scheduleLabel/
  // dateSortLabel below, a missing date is meaningful, not a gap to fill in.
  dateLabels?: Dates[];
  // Omit to have resolveModuleScheduleLabel() derive it from the resolved
  // dateLabels (e.g. "Q1-Mo" or "Q1-Mi + Q2-Mi" for a multi-date module).
  scheduleLabel?: string;
  // modules.date_sort_id, resolved against DATE_SORT_TAGS. Omit to have
  // resolveModuleDateSortLabel() derive it from the first entry in
  // dateLabels (e.g. "Q1-Mo" -> "Q1"). Stays undefined for a module with no
  // dateLabels at all, same reasoning as scheduleLabel.
  dateSortLabel?: (typeof DATE_SORT_TAGS)[number];
  popularity: Popularity;
}

export function resolveModuleDates(module: ModuleFixture): Dates[] {
  return module.dateLabels ?? [];
}

export function resolveModuleScheduleLabel(module: ModuleFixture, dateLabels: Dates[]): string | undefined {
  if (module.scheduleLabel) return module.scheduleLabel;
  if (dateLabels.length === 0) return undefined;
  return dateLabels.join(" + ");
}

export function resolveModuleDateSortLabel(module: ModuleFixture): (typeof DATE_SORT_TAGS)[number] | undefined {
  if (module.dateSortLabel) return module.dateSortLabel;
  const [first] = module.dateLabels ?? [];
  return first ? quarterOf(first) : undefined;
}

export const MODULES: ModuleFixture[] = [
  { name: "Text-Szene", teacher: "Hr. Berger", categories: ["Darstellendes Spiel"], min: 6, max: 14, dateLabels: [Dates.Q1_MO], popularity: "medium" },
  { name: "Impro-Theater1", teacher: "Fr. Berger", categories: ["Darstellendes Spiel"], min: 8, max: 18, dateLabels: [Dates.Q2_MO], popularity: "medium" },
  { name: "Masken", teacher: "Fr. Berger", categories: ["Darstellendes Spiel"], min: 10, max: 25, dateLabels: [Dates.Q3_MO], popularity: "low" },
  { name: "Körper, Bild, Bewegung", teacher: "Fr. Berger", categories: ["Darstellendes Spiel"], min: 10, max: 20, dateLabels: [Dates.Q4_MO], popularity: "low" },
  { name: "Postdramatisches Theater", teacher: "Fr. Berger", categories: ["Darstellendes Spiel"], min: 10, max: 20, scheduleLabel: "Block", popularity: "low" },
  { name: "Performance und Impro", teacher: "Fr. Berger", categories: ["Darstellendes Spiel"], min: 10, max: 20, scheduleLabel: "Block", popularity: "low" },
  { name: "Biografisches Theater", teacher: "Fr. Berger", categories: ["Darstellendes Spiel"], min: 10, max: 20, scheduleLabel: "Block", popularity: "low" },
  { name: "Theater und Musik", teacher: "Fr. Berger", categories: ["Darstellendes Spiel"], min: 10, max: 20, scheduleLabel: "Block", popularity: "low" },
  { name: "Grundlagenkurs für 10er-1", teacher: "Fr. Berger", categories: ["Darstellendes Spiel"], min: 10, max: 20, scheduleLabel: "Block", popularity: "low" },
  { name: "Grundlagenkurs für 10er-2", teacher: "Fr. Berger", categories: ["Darstellendes Spiel"], min: 10, max: 20, scheduleLabel: "Block", popularity: "low" },
  { name: "Vorbereitung Künst-Abschl.", teacher: "Fr. Berger", categories: ["Darstellendes Spiel"], min: 10, max: 20, scheduleLabel: "Block", popularity: "low" },
  

  { name: "Parcour", teacher: "Hr. Brandt", categories: ["Sport"], min: 4, max: 18, dateLabels: [Dates.Q1_MO], popularity: "high" },
  { name: "Basketball", teacher: "Hr. Brandt", categories: ["Sport"], min: 4, max: 18, dateLabels: [Dates.Q1_MI], popularity: "high" },
  { name: "Kanu", teacher: "Fr. Krause", categories: ["Sport"], min: 4, max: 16, dateLabels: [Dates.Q1_FR], scheduleLabel: "Q2-Fr + Block", popularity: "high" },
  { name: "Ultimate", teacher: "Fr. Krause", categories: ["Sport"], min: 4, max: 16, dateLabels: [Dates.Q2_MI], popularity: "high" },
  { name: "Volleyball", teacher: "Fr. Nolte", categories: ["Sport"], min: 4, max: 16, dateLabels: [Dates.Q2_FR], popularity: "medium" },
  { name: "Volleyball", teacher: "Fr. Nolte", categories: ["Sport"], min: 4, max: 16, dateLabels: [Dates.Q2_FR], popularity: "medium" },
  { name: "American Football", teacher: "Hr. Sommer", categories: ["Sport"], min: 4, max: 24, dateLabels: [Dates.Q3_MO], popularity: "low" },
  { name: "Schwimmen", teacher: "Hr. Sommer", categories: ["Sport"], min: 4, max: 24, dateLabels: [Dates.Q3_MI], popularity: "low" },
  { name: "Bouldern", teacher: "Hr. Sommer", categories: ["Sport"], min: 4, max: 24, dateLabels: [Dates.Q3_FR], popularity: "high" },
  { name: "Badminton", teacher: "Hr. Sommer", categories: ["Sport"], min: 4, max: 24, dateLabels: [Dates.Q4_MO], popularity: "high" },
  { name: "Fußball", teacher: "Fr. Helig", categories: ["Sport"], min: 4, max: 12, dateLabels: [Dates.Q4_MI], popularity: "high" },
  { name: "Klettern", teacher: "Fr. Helig", categories: ["Sport"], min: 4, max: 12, dateLabels: [Dates.Q4_FR], popularity: "medium" },


  { name: "Python", teacher: "Fr. Zimmermann", categories: ["Informatik"], min: 8, max: 20, dateLabels: [Dates.Q1_MO], popularity: "low" },
  { name: "Scratch", teacher: "Fr. Zimmermann", categories: ["Informatik"], min: 8, max: 20, dateLabels: [Dates.Q2_MO], popularity: "low" },
  { name: "Robotik", teacher: "Fr. Zimmermann", categories: ["Informatik"], min: 8, max: 20, dateLabels: [Dates.Q3_MO], popularity: "low" },
  { name: "KI-Werkstatt", teacher: "Fr. Zimmermann", categories: ["Informatik"], min: 8, max: 20, dateLabels: [Dates.Q4_MO], popularity: "high" },
 
 
  { name: "Fotografie", teacher: "Hr. Wagner", categories: ["Informatik"], min: 6, max: 14, dateLabels: [Dates.Q1_MI], scheduleLabel: "Block B", popularity: "high" },
  { name: "Malerei & Zeichnen", teacher: "Fr. Fischer", categories: ["Informatik"], min: 8, max: 16, dateLabels: [Dates.Q1_MO], popularity: "medium" },
  { name: "Töpfern & Keramik", teacher: "Fr. Peters", categories: ["Informatik"], min: 8, max: 12, dateLabels: [Dates.Q1_FR], scheduleLabel: "Block C", popularity: "low" },
  { name: "Nähen & Textildesign", teacher: "Fr. Zimmermann", categories: ["Informatik"], min: 8, max: 14, dateLabels: [Dates.Q1_MI], scheduleLabel: "Block B", popularity: "low" },


  { name: "Ökologie", teacher: "Hr. Schulz", categories: ["Bio/ChemieTech"], min: 8, max: 16, dateLabels: [Dates.Q1_MI], popularity: "high" },
  { name: "Genetik", teacher: "Fr. Klein", categories: ["Bio/ChemieTech"], min: 8, max: 18, dateLabels: [Dates.Q2_MO], scheduleLabel: "Block B", popularity: "high" },
  { name: "Genetik", teacher: "Hr. Roth", categories: ["Bio/ChemieTech", "Informatik"], min: 8, max: 14, dateLabels: [Dates.Q1_FR], scheduleLabel: "Block C", popularity: "medium" },
  { name: "Chemie-Experimente", teacher: "Fr. Weiß", categories: ["Bio/ChemieTech"], min: 8, max: 16, dateLabels: [Dates.Q1_MO], popularity: "medium" },
  { name: "Programmieren mit Scratch", teacher: "Hr. Neumann", categories: ["Bio/ChemieTech"], min: 8, max: 14, dateLabels: [Dates.Q1_MI], scheduleLabel: "Block B", popularity: "medium" },
  
  { name: "Französisch-Konversation", teacher: "Fr. Girard", categories: ["Sprachen & Musik"], min: 8, max: 16, dateLabels: [Dates.Q1_MO], scheduleLabel: "Block C", popularity: "low" },
  { name: "Spanisch für Anfänger", teacher: "Hr. Alonso", categories: ["Sprachen & Musik"], min: 8, max: 16, dateLabels: [Dates.Q1_MO], popularity: "low" },
  { name: "Gitarre", teacher: "Hr. Alonso", categories: ["Sprachen & Musik"], min: 3, max: 10, dateLabels: [Dates.Q3_FR], popularity: "low" },
  { name: "Schulband", teacher: "Hr. Alonso", categories: ["Sprachen & Musik"], min: 3, max: 10, dateLabels: [Dates.Q1_MO], popularity: "low" },
  { name: "Chor", teacher: "Hr. Alonso", categories: ["Sprachen & Musik"], min: 3, max: 30, dateLabels: [Dates.Q2_MI], popularity: "low" },
];

export interface RuleFixture {
  name: string;
  moduleCount: number;
  priority: boolean;
  blockedCategoryNames?: readonly (typeof CATEGORIES)[number][];
  blockedDateLabels?: Dates[];
}

export const RULES: RuleFixture[] = [
  { name: "10er-Rule", moduleCount: 7, priority: false },
  { name: "11er-Rule", moduleCount: 7, priority: false },
  { name: "12er-Rule", moduleCount: 6, priority: true, blockedDateLabels: [Dates.Q1_FR] },
  {
    name: "Ausnahme-Auslandssemester",
    moduleCount: 2,
    priority: false,
    blockedDateLabels: [Dates.Q1_MO, Dates.Q1_MI, Dates.Q1_FR, Dates.Q2_MO],
  },
];

export interface GroupFixture {
  name: string;
  ruleName: string;
  // Class sizes vary in reality (a specialized track like VDFS is smaller
  // than a full year-group class), so this is per-group, not a single
  // count applied uniformly across all groups.
  studentCount: number;
}

export const GROUPS: GroupFixture[] = [
  { name: "10. Klasse", ruleName: "10er-Rule", studentCount: 28 },
  { name: "11. Klasse", ruleName: "11er-Rule", studentCount: 24 },
  { name: "12. Klasse", ruleName: "12er-Rule", studentCount: 18 },
  { name: "VDFS", ruleName: "12er-Rule", studentCount: 12 },
];
