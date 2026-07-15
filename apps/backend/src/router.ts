import { router, publicProcedure } from "./trpc";

export const appRouter = router({
  health: publicProcedure.query(() => {
    return { status: "ok" as const };
  }),
});

export type AppRouter = typeof appRouter;