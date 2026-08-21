import { z } from "zod";

export const settingsUpdateInput = z.object({
  votingInviteIntro: z.string(),
  votingResultsIntro: z.string(),
  welcomeText: z.string(),
});
export type SettingsUpdateInput = z.infer<typeof settingsUpdateInput>;
