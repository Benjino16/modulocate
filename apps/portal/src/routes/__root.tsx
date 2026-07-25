import type { ReactNode } from "react";
import { useEffect } from "react";
import { createRootRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Sidebar } from "../components/Sidebar";
import { authClient } from "../lib/auth-client";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/login") return <Outlet />;

  return (
    <AuthGuard>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-auto">
          <Outlet />
        </main>
      </div>
    </AuthGuard>
  );
}

// Gates every route but /login on a better-auth session — see planning.md
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
