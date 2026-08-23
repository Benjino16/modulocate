import { z } from "zod";

// Fields a client may set. Deliberately excludes columns that are never client
// input: `id`/`projectId` (server-assigned/derived from the tRPC context, never
// trusted from the client) and `permanentName` (system-assigned, tracks "the
// same" module across projects — not something a user types in).
const moduleFields = z.object({
  name: z.string().min(1),
  // sanitized server-side before persisting — see apps/backend/src/lib/sanitize.ts
  description: z.string().optional(),
  teacher: z.string().optional(),
  pictureUrl: z.url().optional(),
  min: z.number().int().nonnegative(),
  max: z.number().int().nonnegative(),
  scheduleLabel: z.string().optional(),
  dateSortId: z.uuid().optional(),
  categorySortId: z.uuid().optional(),
  // categories the module belongs to (module_in_category) — drives rule/blocking
  // resolution, distinct from categorySortId's UI-only grouping above
  categoryIds: z.array(z.uuid()).default([]),
  // dates the module occupies (module_in_date) — drives rule/blocking
  // resolution, same reasoning as categoryIds above
  dateIds: z.array(z.uuid()).default([]),
});

export const moduleCreateInput = moduleFields.refine((data) => data.max >= data.min, {
  message: "max must be >= min",
  path: ["max"],
});

export const moduleUpdateInput = z.object({
  id: z.uuid(),
  ...moduleFields.partial().shape,
  // Overrides the `.default([])` from moduleFields: on a partial update, an
  // omitted categoryIds/dateIds must mean "leave alone", not "replace with
  // []" — the router treats [] (present) and undefined (absent) differently.
  categoryIds: z.array(z.uuid()).optional(),
  dateIds: z.array(z.uuid()).optional(),
  // Nullable on top of optional for every clearable column: omitted
  // (undefined) means "leave alone", explicit null means "clear this field".
  // Needed because tRPC's plain-JSON transport silently drops keys whose
  // value is undefined, so a client can't otherwise distinguish "never
  // touched this field" from "cleared it back to empty".
  description: z.string().nullable().optional(),
  teacher: z.string().nullable().optional(),
  pictureUrl: z.url().nullable().optional(),
  scheduleLabel: z.string().nullable().optional(),
  dateSortId: z.uuid().nullable().optional(),
  categorySortId: z.uuid().nullable().optional(),
});
// Note: partial updates skip the max>=min cross-field check for now — enforcing
// it correctly requires comparing against the persisted row, not just the patch.
// Revisit once the update procedure actually reads-before-write.

export type ModuleCreateInput = z.infer<typeof moduleCreateInput>;
export type ModuleUpdateInput = z.infer<typeof moduleUpdateInput>;

// Import/export file shape for the Data > Module bulk import/export feature.
// Categories/dates are carried as plain name strings, not ids — they're
// project-local relations, so a round-trip through a different project (or a
// re-import after categories were renamed) resolves them by name instead of
// an id that may not exist there. See modules.importBatch: an existing
// category/date is matched by name (first match wins on duplicates), a
// missing one is created.
const moduleExportFields = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  teacher: z.string().nullable().optional(),
  scheduleLabel: z.string().nullable().optional(),
  min: z.number().int().nonnegative(),
  max: z.number().int().nonnegative(),
  categoryNames: z.array(z.string().min(1)).default([]),
  dateNames: z.array(z.string().min(1)).default([]),
});

export const moduleExportEntry = moduleExportFields.refine((data) => data.max >= data.min, {
  message: "max must be >= min",
  path: ["max"],
});

// version: 1 — bump on any breaking change to the entry shape so an older
// export file can be rejected with a clear error instead of silently
// misparsing.
export const moduleImportFile = z.object({
  version: z.literal(1),
  modules: z.array(moduleExportEntry),
});

export type ModuleExportEntry = z.infer<typeof moduleExportEntry>;
export type ModuleImportFile = z.infer<typeof moduleImportFile>;
