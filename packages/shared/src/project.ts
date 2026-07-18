import { z } from "zod";

// See planning.md "Locked Decision: `phase` Column on `projects`" — text +
// Zod enum, not a Postgres enum type, so adding/renaming a phase is a
// validator change, not a migration. Portal sidebar mapping: Daten = setup,
// Umfrage = voting/closed, Zuteilung = allocating, Anpassungen = reviewing,
// Ergebnisse = finalized/published.
export const projectPhase = z.enum([
  "setup",
  "voting",
  "closed",
  "allocating",
  "reviewing",
  "finalized",
  "published",
]);

export type ProjectPhase = z.infer<typeof projectPhase>;

export const projectCreateInput = z.object({
  name: z.string().min(1),
});

export type ProjectCreateInput = z.infer<typeof projectCreateInput>;
