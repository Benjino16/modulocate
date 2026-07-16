import { router, publicProcedure } from "./trpc";
import { db } from "./db";
import { modules } from "./db/schema";

export const appRouter = router({
  health: publicProcedure.query(() => {
    return { status: "ok" as const };
  }),
  modules: router({
    list: publicProcedure.query(() => db.select().from(modules)),
  }),
});

export type AppRouter = typeof appRouter;