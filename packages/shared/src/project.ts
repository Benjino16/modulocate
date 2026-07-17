import { z } from "zod";

// See planning.md "Locked Decision: `phase` Column on `projects`" — text +
// Zod enum, not a Postgres enum type, so adding/renaming a phase is a
// validator change, not a migration. Portal sidebar mapping: Daten = setup,
// Umfrage = open/closed, Zuteilung = allocating, Anpassungen = reviewing,
// Ergebnisse = finalized/published.
export const projectPhase = z.enum([
  "setup",
  "open",
  "closed",
  "allocating",
  "reviewing",
  "finalized",
  "published",
]);

export type ProjectPhase = z.infer<typeof projectPhase>;
