import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/data/")({
  beforeLoad: () => {
    throw redirect({ to: "/data/modules" });
  },
});
