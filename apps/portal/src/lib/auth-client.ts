import { createAuthClient } from "better-auth/react";

// No baseURL: portal and backend are same-origin behind Traefik
// (http://modulocate.localhost — see infra/compose.yaml), so better-auth's
// client falls back to window.location.origin + its default basePath
// (/api/auth), which is exactly where the backend mounts it (index.ts).
export const authClient = createAuthClient();
