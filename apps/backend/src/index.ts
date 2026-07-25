import "dotenv/config";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./router";
import { createContext } from "./context";
import { auth } from "./auth";
import { bootstrapAdmin } from "./bootstrapAdmin";

const server = Fastify({ logger: true });

// No CORS needed: backend, portal and vote all live behind Traefik under one
// origin (http://modulocate.localhost, path-routed to /api, /portal,
// /voting), so every request — including the student session cookie and the
// better-auth session cookie — is same-origin. See infra/compose.yaml.
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
  prefix: "/api/trpc",
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