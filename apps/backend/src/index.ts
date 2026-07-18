import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./router";
import { createContext } from "./context";

const server = Fastify({ logger: true });

// credentials: true + an explicit origin list (not "*") is required for the
// student session cookie to work — vote-web and backend are different
// origins, see planning.md "Locked Decision: Two Separate Auth Mechanisms".
await server.register(cors, {
  origin: ["http://localhost:5173", "http://localhost:5174"],
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