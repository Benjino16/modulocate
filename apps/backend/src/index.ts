import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./router";
import { createContext } from "./context";

const server = Fastify({ logger: true });

// credentials: true + an explicit origin check (not "*") is required for the
// student session cookie to work — vote-web and backend are different
// origins, see planning.md "Locked Decision: Two Separate Auth Mechanisms".
// Matches port 5173/5174 on any host (not just localhost) so the dev servers
// are reachable from a phone on the LAN via --host — fine for local dev,
// tighten to an explicit allowlist before this ever runs in production.
await server.register(cors, {
  origin: /^http:\/\/[^/]+:517[34]$/,
  credentials: true,
});
await server.register(cookie);

server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter,
    createContext,
  },
});

server.listen({ port: 3000, host: "0.0.0.0" }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
});