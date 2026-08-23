import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@modulocate/backend/router";

// Relative URL — portal and backend are same-origin behind Traefik
// (http://modulocate.localhost, path-routed to /portal and /api — see
// compose.dev.yaml, compose.yaml), so the default fetch() credentials: "same-origin"
// already sends the better-auth session cookie.
export const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/api/trpc" })],
});

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
