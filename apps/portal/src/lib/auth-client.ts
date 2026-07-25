import { createAuthClient } from "better-auth/react";

// Uses the page's own hostname (not a hardcoded "localhost"), same reasoning
// as trpc.ts — keeps LAN/phone dev access working.
export const authClient = createAuthClient({
  baseURL: `http://${window.location.hostname}:3000`,
});
