import { router, publicProcedure } from "./trpc";
import { projectsRouter } from "./routers/projects";
import { studentsRouter } from "./routers/students";
import { modulesRouter } from "./routers/modules";
import { moduleCategoriesRouter } from "./routers/moduleCategories";
import { datesRouter } from "./routers/dates";
import { rulesRouter } from "./routers/rules";
import { studentGroupsRouter } from "./routers/studentGroups";
import { mailRouter } from "./routers/mail";
import { voteAuthRouter } from "./routers/voteAuth";
import { voteRouter } from "./routers/vote";

export const appRouter = router({
  health: publicProcedure.query(() => {
    return { status: "ok" as const };
  }),

  projects: projectsRouter,
  students: studentsRouter,
  modules: modulesRouter,
  moduleCategories: moduleCategoriesRouter,
  dates: datesRouter,
  rules: rulesRouter,
  studentGroups: studentGroupsRouter,
  mail: mailRouter,
  voteAuth: voteAuthRouter,
  vote: voteRouter,
});

export type AppRouter = typeof appRouter;
