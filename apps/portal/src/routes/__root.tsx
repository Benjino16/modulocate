import type { ReactNode } from "react";
import { useEffect } from "react";
import { createRootRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ThemeToggle } from "@modulocate/ui/components/theme-toggle";
import { Sidebar } from "../components/Sidebar";
import { authClient } from "../lib/auth-client";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const publicRoutes = ["/login", "/forgot-password", "/reset-password"];

  if (publicRoutes.includes(pathname)) {
    return (
      <div className="relative">
        <div className="absolute top-3 right-3">
          <ThemeToggle />
        </div>
        <Outlet />
      </div>
    );
  }

  return (
    <AuthGuard>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-auto">
          <div className="flex h-14 shrink-0 items-center justify-end border-b px-3">
            <ThemeToggle />
          </div>
          <Outlet />
        </main>
      </div>
    </AuthGuard>
  );
}

// Gates every route but the public auth ones (login/forgot/reset password)
// on a better-auth session — see planning.md
// "Locked Decision: Two Separate Auth Mechanisms". No role/permission check
// yet, just "is someone signed in" (tracked in planning.md Section 6).
function AuthGuard({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isPending && !session) navigate({ to: "/login" });
  }, [isPending, session, navigate]);

  if (isPending || !session) return null;
  return children;
}
