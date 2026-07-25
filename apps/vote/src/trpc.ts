import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@modulocate/backend/router";

// Relative URL — vote and backend are same-origin behind Traefik
// (http://modulocate.localhost, path-routed to /voting and /api — see
// infra/compose.yaml), so the default fetch() credentials: "same-origin"
// already sends the student session cookie.
export const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/api/trpc" })],
});

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
