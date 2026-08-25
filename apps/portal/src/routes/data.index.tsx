import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Calendar, ScrollText, Settings, Tag, Users, UsersRound } from "lucide-react";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";

export const Route = createFileRoute("/data/")({
  component: DataOverviewPage,
});

function DataOverviewPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const enabled = !!projectId;

  const { data: modules } = useQuery({
    ...trpc.modules.list.queryOptions({ projectId: projectId! }),
    enabled,
  });
  const { data: categories } = useQuery({
    ...trpc.moduleCategories.list.queryOptions({ projectId: projectId! }),
    enabled,
  });
  const { data: dates } = useQuery({
    ...trpc.dates.list.queryOptions({ projectId: projectId! }),
    enabled,
  });
  const { data: students } = useQuery({
    ...trpc.students.list.queryOptions({ projectId: projectId! }),
    enabled,
  });
  const { data: rules } = useQuery({
    ...trpc.rules.list.queryOptions({ projectId: projectId! }),
    enabled,
  });
  const { data: groups } = useQuery({
    ...trpc.studentGroups.list.queryOptions({ projectId: projectId! }),
    enabled,
  });

  const tiles = [
    { to: "/data/settings", label: "Einstellungen", icon: Settings, count: undefined },
    { to: "/data/modules", label: "Module", icon: BookOpen, count: modules?.length },
    { to: "/data/categories", label: "Kategorien", icon: Tag, count: categories?.length },
    { to: "/data/dates", label: "Termine", icon: Calendar, count: dates?.length },
    { to: "/data/students", label: "Schüler", icon: Users, count: students?.length },
    { to: "/data/rules", label: "Regeln", icon: ScrollText, count: rules?.length },
    { to: "/data/groups", label: "Gruppen", icon: UsersRound, count: groups?.length },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Übersicht</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className="flex flex-col gap-3 rounded-md border p-4 transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <tile.icon className="size-4" />
              {tile.label}
            </div>
            <span className="text-3xl font-semibold">{tile.count ?? "–"}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
