import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@modulocate/backend/router";

// Uses the page's own hostname (not a hardcoded "localhost") so this also
// works when the app is opened via a LAN IP, e.g. from a phone during dev.
export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `http://${window.location.hostname}:3000/trpc`,
      // fetch() defaults to credentials: "same-origin", which drops the
      // better-auth session cookie since portal (5173) and backend (3000)
      // are different origins — same reason voteAuthRouter needs
      // credentials: true on the CORS side in index.ts.
      fetch(url, options) {
        return fetch(url, { ...options, credentials: "include" });
      },
    }),
  ],
});

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
