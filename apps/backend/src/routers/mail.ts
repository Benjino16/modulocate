import { z } from "zod";
import { sendTestEmail } from "@modulocate/mailer";
import { router, publicProcedure } from "../trpc";

export const mailRouter = router({
  sendTest: publicProcedure
    .input(z.object({ to: z.email() }))
    .mutation(async ({ input }) => {
      await sendTestEmail(input.to);
      return { success: true as const };
    }),
});
