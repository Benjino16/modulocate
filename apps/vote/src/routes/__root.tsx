import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeToggle } from "@modulocate/ui/components/theme-toggle";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center justify-end px-3">
        <ThemeToggle />
      </div>
      <Outlet />
    </div>
  );
}
