import { and, eq, inArray } from "drizzle-orm";
import { settingsUpdateInput } from "@modulocate/shared";
import { db, settings } from "@modulocate/db";
import { router, staffProcedure } from "../trpc";
import { projectScoped } from "./shared";
import { sanitizeRichText } from "../lib/sanitize";

const KEYS = ["votingInviteIntro", "votingResultsIntro", "welcomeText"] as const;

export const settingsRouter = router({
  get: staffProcedure.input(projectScoped).query(async ({ input }) => {
    const rows = await db
      .select()
      .from(settings)
      .where(and(eq(settings.projectId, input.projectId), inArray(settings.key, KEYS)));
    const byKey = new Map(rows.map((r) => [r.key, r.value as string]));
    return {
      votingInviteIntro: byKey.get("votingInviteIntro") ?? "",
      votingResultsIntro: byKey.get("votingResultsIntro") ?? "",
      welcomeText: byKey.get("welcomeText") ?? "",
    };
  }),

  // Always upserts all 3 keys together, matching the settings page's single
  // save button — there's no per-field save, so no need to diff against what
  // changed.
  update: staffProcedure
    .input(settingsUpdateInput.and(projectScoped))
    .mutation(async ({ input }) => {
      const { projectId, ...fields } = input;
      await Promise.all(
        (Object.entries(fields) as [(typeof KEYS)[number], string][]).map(([key, value]) =>
          db
            .insert(settings)
            .values({ projectId, key, value: sanitizeRichText(value) })
            .onConflictDoUpdate({
              target: [settings.projectId, settings.key],
              set: { value: sanitizeRichText(value) },
            }),
        ),
      );
      return { success: true as const };
    }),
});
