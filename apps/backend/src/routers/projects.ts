import { db, projects } from "@modulocate/db";
import { router, publicProcedure } from "../trpc";

// Stopgap until auth/sessions exist: lists every project so the portal's
// project switcher has something to select from (see projectScoped in ./shared).
export const projectsRouter = router({
  list: publicProcedure.query(() => db.select().from(projects)),
});
