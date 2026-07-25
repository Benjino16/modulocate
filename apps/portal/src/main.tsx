import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import "@modulocate/ui/globals.css";
import { routeTree } from "./routeTree.gen";
import { TRPCProvider, trpcClient } from "./trpc";
import { ProjectProvider } from "./lib/project-context";

const queryClient = new QueryClient();
// basepath matches the /portal PathPrefix Traefik routes this app under
// (see infra/compose.yaml) and the base in vite.config.ts.
const router = createRouter({ routeTree, basepath: "/portal" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <ProjectProvider>
          <RouterProvider router={router} />
        </ProjectProvider>
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
);
