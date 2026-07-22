import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { ProjectPhase } from "@modulocate/shared";

// --- Account / Admin ---

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  datetime: timestamp("datetime", { withTimezone: true }).notNull().defaultNow(),
  log: text("log").notNull(),
  userId: uuid("user_id").references(() => users.id),
});

// --- Module-System ---

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // setup -> voting -> closed -> allocating -> reviewing -> finalized -> published
  // (see planning.md "Locked Decision: `phase` Column on `projects`") — text +
  // Zod enum (packages/shared), not a Postgres enum type, so a new phase name
  // never needs a migration, only a validator change. $type<> pins the TS
  // shape to that same enum without touching the runtime column type.
  phase: text("phase").notNull().default("setup").$type<ProjectPhase>(),
});

export const settings = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
});

// Lightweight lookup tags purely for UI sort/grouping (e.g. "all Q1 modules"),
// deliberately decoupled from `dates`/`module_categories` — those drive rules
// and blocking, these two never touch the allocation engine. A shared row (not
// a free string on `modules`) means renaming "Q1" -> "Quartal 1" is one edit,
// not a pass over every module.
export const dateSortTags = pgTable("date_sort_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const categorySortTags = pgTable("category_sort_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const modules = pgTable("modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  // lets the system recognize "the same" module across projects/years
  permanentName: text("permanent_name").notNull(),
  name: text("name").notNull(),
  // rich-text HTML, edited via tiptap in the portal and sanitized server-side
  // before it ever reaches Postgres — see apps/backend/src/lib/sanitize.ts
  description: text("description"),
  teacher: text("teacher"),
  pictureUrl: text("picture_url"),
  min: integer("min").notNull(),
  max: integer("max").notNull(),
  // short freeform display string ("Jeden Montag", "Q2 - Mi", "Block") for the
  // module tile — deliberately per-module free text, since it's also where
  // one-off deviations from the norm get written down
  scheduleLabel: text("schedule_label"),
  // UI-only sort/group buckets, e.g. "Q1" or "Musik" without the weekday/
  // sub-category noise — see dateSortTags/categorySortTags above
  dateSortId: uuid("date_sort_id").references(() => dateSortTags.id),
  categorySortId: uuid("category_sort_id").references(() => categorySortTags.id),
});

export const moduleCategories = pgTable("module_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
});

export const moduleInCategory = pgTable(
  "module_in_category",
  {
    moduleId: uuid("module_id").notNull().references(() => modules.id),
    categoryId: uuid("category_id").notNull().references(() => moduleCategories.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
  },
  (table) => [primaryKey({ columns: [table.moduleId, table.categoryId] })],
);

// --- Rules (declared before groups/students, which reference rules) ---

export const rules = pgTable("rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  // how many modules a student under this rule should end up with
  moduleCount: integer("module_count").notNull(),
  // whether students under this rule get priority during allocation
  priority: boolean("priority").notNull().default(false),
});

export const subRules = pgTable("sub_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  // sub-rules are owned by their rule — deleting a rule deletes its sub-rules
  ruleId: uuid("rule_id").notNull().references(() => rules.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id),
});

export const categoryInSubRule = pgTable(
  "category_in_sub_rule",
  {
    // category assignments are owned by their sub-rule — same cascade reasoning
    subRuleId: uuid("sub_rule_id").notNull().references(() => subRules.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => moduleCategories.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
  },
  (table) => [primaryKey({ columns: [table.subRuleId, table.categoryId] })],
);

// --- Groups & Students ---

export const studentGroups = pgTable("student_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  // nullable override, not ownership — if the rule is deleted the group simply
  // has no rule again, it doesn't take the group down with it
  ruleId: uuid("rule_id").references(() => rules.id, { onDelete: "set null" }),
});

export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  email2: text("email_2").unique(),
  signInCode: text("sign_in_code").unique(),
  voteStatus: text("vote_status").notNull(),
  // Set once, on the student's first successful vote-app login — distinct
  // from voteSubmittedAt so the portal can show "opened but not voted yet"
  // instead of collapsing that into a single voted/not-voted flag.
  voteOpenedAt: timestamp("vote_opened_at", { withTimezone: true }),
  // Overwritten on every submitPreferences call (not just the first), since
  // resubmitting while the election is open is allowed and "last voted at"
  // should reflect the most recent submission.
  voteSubmittedAt: timestamp("vote_submitted_at", { withTimezone: true }),
  // overrides the group's rule when set; same "set null, not owned" reasoning
  ruleId: uuid("rule_id").references(() => rules.id, { onDelete: "set null" }),
});

export const studentInGroup = pgTable(
  "student_in_group",
  {
    studentId: uuid("student_id").notNull().references(() => students.id),
    groupId: uuid("group_id").notNull().references(() => studentGroups.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
  },
  (table) => [primaryKey({ columns: [table.studentId, table.groupId] })],
);

export const dates = pgTable("dates", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
});

export const moduleInDate = pgTable(
  "module_in_date",
  {
    moduleId: uuid("module_id").notNull().references(() => modules.id),
    dateId: uuid("date_id").notNull().references(() => dates.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
  },
  (table) => [primaryKey({ columns: [table.moduleId, table.dateId] })],
);

// --- Blocking ---
// Blocking hangs off the rule, not off the group/student directly. Both
// student_groups.rule_id and students.rule_id point at the same `rules` row,
// so a rule's blocked_* rows apply the same way regardless of which one holds
// it — many groups sharing identical restrictions just share one rule, and a
// student needing a different block set gets their own rule (students.rule_id
// overrides student_groups.rule_id), rather than this table needing its own
// group/student-level override semantics.

export const ruleBlockedCategory = pgTable(
  "rule_blocked_category",
  {
    // blocked rows are owned by their rule — same cascade reasoning as sub_rules
    ruleId: uuid("rule_id").notNull().references(() => rules.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => moduleCategories.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
  },
  (table) => [primaryKey({ columns: [table.ruleId, table.categoryId] })],
);

export const ruleBlockedDate = pgTable(
  "rule_blocked_date",
  {
    ruleId: uuid("rule_id").notNull().references(() => rules.id, { onDelete: "cascade" }),
    dateId: uuid("date_id").notNull().references(() => dates.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
  },
  (table) => [primaryKey({ columns: [table.ruleId, table.dateId] })],
);

// --- Voting & Allocation ---
// No student_eligible_module snapshot table — eligibility is resolved live
// per request (see planning.md "Deferred Decision: Live Resolution for the
// Vote App — No Snapshot Table (Yet)").

export const studentPreferences = pgTable(
  "student_preferences",
  {
    studentId: uuid("student_id").notNull().references(() => students.id),
    moduleId: uuid("module_id").notNull().references(() => modules.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    preference: integer("preference").notNull(),
  },
  (table) => [primaryKey({ columns: [table.studentId, table.moduleId] })],
);

export const studentInModule = pgTable(
  "student_in_module",
  {
    studentId: uuid("student_id").notNull().references(() => students.id),
    moduleId: uuid("module_id").notNull().references(() => modules.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
  },
  (table) => [primaryKey({ columns: [table.studentId, table.moduleId] })],
);

// --- Email ---

// Durable send history, written by the worker after a job finishes — BullMQ's
// own Redis-side job records are operational state and get pruned, this is
// the queryable log the portal reads for delivery status.
export const emailLog = pgTable("email_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id),
  studentId: uuid("student_id").references(() => students.id),
  userId: uuid("user_id").references(() => users.id),
  type: text("type").notNull(),
  recipient: text("recipient").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});
