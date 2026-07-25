import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./router";
import { createContext } from "./context";
import { auth } from "./auth";
import { bootstrapAdmin } from "./bootstrapAdmin";

const server = Fastify({ logger: true });

// credentials: true + an explicit origin check (not "*") is required for the
// student session cookie (vote-web) and the better-auth session cookie
// (portal-web) to work — both are cross-origin from the backend, see
// planning.md "Locked Decision: Two Separate Auth Mechanisms". Matches port
// 5173/5174 on any host (not just localhost) so the dev servers are
// reachable from a phone on the LAN via --host — fine for local dev, tighten
// to an explicit allowlist before this ever runs in production.
await server.register(cors, {
  origin: /^http:\/\/[^/]+:517[34]$/,
  credentials: true,
});
await server.register(cookie);

// better-auth's own fetch-Request handler, bridged onto Fastify. Reuses
// Fastify's already-parsed JSON body (its default content-type parser has
// already run by the time this handler executes) instead of reading
// request.raw a second time, which would find the stream already drained.
server.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value) headers.append(key, Array.isArray(value) ? value.join(", ") : value);
    }
    const authRequest = new Request(url, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : JSON.stringify(request.body),
    });
    const response = await auth.handler(authRequest);
    reply.status(response.status);
    response.headers.forEach((value, key) => reply.header(key, value));
    reply.send(response.body ? await response.text() : null);
  },
});

server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter,
    createContext,
  },
});

await bootstrapAdmin();

server.listen({ port: 3000, host: "0.0.0.0" }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
});