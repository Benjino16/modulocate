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
});

export const settings = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
});

export const modules = pgTable("modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  // lets the system recognize "the same" module across projects/years
  permanentName: text("permanent_name").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  teacher: text("teacher"),
  pictureUrl: text("picture_url"),
  min: integer("min").notNull(),
  max: integer("max").notNull(),
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

export const categoryIncludesCategory = pgTable(
  "category_includes_category",
  {
    parentCategoryId: uuid("parent_category_id").notNull().references(() => moduleCategories.id),
    subCategoryId: uuid("sub_category_id").notNull().references(() => moduleCategories.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
  },
  (table) => [primaryKey({ columns: [table.parentCategoryId, table.subCategoryId] })],
);

// --- Rules (declared before groups/students, which reference rules) ---

export const rules = pgTable("rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
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

// --- Blocking ---
// group_*/student_* pairs share the same shape: isBlocked=true blocks, false is an
// explicit allow (whitelist) that overrides a group-level block when set on the student.

export const groupBlockedCategory = pgTable(
  "group_blocked_category",
  {
    groupId: uuid("group_id").notNull().references(() => studentGroups.id),
    categoryId: uuid("category_id").notNull().references(() => moduleCategories.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    isBlocked: boolean("is_blocked").notNull(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.categoryId] })],
);

export const groupBlockedModule = pgTable(
  "group_blocked_module",
  {
    groupId: uuid("group_id").notNull().references(() => studentGroups.id),
    moduleId: uuid("module_id").notNull().references(() => modules.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    isBlocked: boolean("is_blocked").notNull(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.moduleId] })],
);

export const studentBlockedCategory = pgTable(
  "student_blocked_category",
  {
    studentId: uuid("student_id").notNull().references(() => students.id),
    categoryId: uuid("category_id").notNull().references(() => moduleCategories.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    isBlocked: boolean("is_blocked").notNull(),
  },
  (table) => [primaryKey({ columns: [table.studentId, table.categoryId] })],
);

export const studentBlockedModule = pgTable(
  "student_blocked_module",
  {
    studentId: uuid("student_id").notNull().references(() => students.id),
    moduleId: uuid("module_id").notNull().references(() => modules.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    isBlocked: boolean("is_blocked").notNull(),
  },
  (table) => [primaryKey({ columns: [table.studentId, table.moduleId] })],
);

export const groupBlockedDate = pgTable(
  "group_blocked_date",
  {
    groupId: uuid("group_id").notNull().references(() => studentGroups.id),
    dateId: uuid("date_id").notNull().references(() => dates.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    isBlocked: boolean("is_blocked").notNull(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.dateId] })],
);

export const studentBlockedDate = pgTable(
  "student_blocked_date",
  {
    studentId: uuid("student_id").notNull().references(() => students.id),
    dateId: uuid("date_id").notNull().references(() => dates.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    isBlocked: boolean("is_blocked").notNull(),
  },
  (table) => [primaryKey({ columns: [table.studentId, table.dateId] })],
);

// --- Voting & Allocation ---

export const studentEligibleModule = pgTable(
  "student_eligible_module",
  {
    studentId: uuid("student_id").notNull().references(() => students.id),
    moduleId: uuid("module_id").notNull().references(() => modules.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
  },
  (table) => [primaryKey({ columns: [table.studentId, table.moduleId] })],
);

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
