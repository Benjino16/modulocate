import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/project-context";

export const Route = createFileRoute("/data/students")({
  component: StudentsPage,
});

function StudentsPage() {
  const trpc = useTRPC();
  const { projectId } = useProject();
  const { data: students, isLoading } = useQuery({
    ...trpc.students.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  if (isLoading) return <p className="text-muted-foreground">Lade Schüler…</p>;
  if (!students?.length) return <p className="text-muted-foreground">Noch keine Schüler angelegt.</p>;

  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b text-muted-foreground">
        <tr>
          <th className="py-2 font-medium">Name</th>
          <th className="py-2 font-medium">E-Mail</th>
          <th className="py-2 font-medium">Vote-Status</th>
        </tr>
      </thead>
      <tbody>
        {students.map((student) => (
          <tr key={student.id} className="border-b last:border-0">
            <td className="py-2">{student.name}</td>
            <td className="py-2 text-muted-foreground">{student.email}</td>
            <td className="py-2 text-muted-foreground">{student.voteStatus}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
