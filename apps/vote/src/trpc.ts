import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@modulocate/backend/router";

// credentials: "include" is required so the HttpOnly student session cookie
// is sent on every request — vote-web and backend are different origins, see
// planning.md "Locked Decision: Two Separate Auth Mechanisms".
// Uses the page's own hostname (not a hardcoded "localhost") so this also
// works when the app is opened via a LAN IP, e.g. from a phone during dev.
export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `http://${window.location.hostname}:3000/trpc`,
      fetch(url, options) {
        return fetch(url, { ...options, credentials: "include" });
      },
    }),
  ],
});

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
