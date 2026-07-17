import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { projects } from "../db/schema";

// Stopgap until auth/sessions exist: lists every project so the portal's
// project switcher has something to select from (see projectScoped in ./shared).
export const projectsRouter = router({
  list: publicProcedure.query(() => db.select().from(projects)),
});
