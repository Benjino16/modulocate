import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PhaseLayout } from "../components/PhaseLayout";

export const Route = createFileRoute("/survey")({
  component: SurveyLayout,
});

const tabs = [
  { to: "/survey", label: "Umfrage" },
  { to: "/survey/students", label: "Schüler" },
];

function SurveyLayout() {
  return (
    <PhaseLayout tabs={tabs}>
      <Outlet />
    </PhaseLayout>
  );
}
