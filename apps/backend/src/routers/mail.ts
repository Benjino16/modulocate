import { z } from "zod";
import { sendTestEmail } from "@modulocate/mailer";
import { router, staffProcedure } from "../trpc";

export const mailRouter = router({
  sendTest: staffProcedure
    .input(z.object({ to: z.email() }))
    .mutation(async ({ input }) => {
      await sendTestEmail(input.to);
      return { success: true as const };
    }),
});
