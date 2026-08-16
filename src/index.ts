import { serve } from "bun";
import index from "./index.html";
import { createGameApp } from "@/server/app";
import type { Server } from "bun";
import type { WsData } from "@/server/app";

const app = createGameApp();

const server = serve<WsData>({
  port: Number(process.env.PORT) || 4000,
  routes: {
    "/*": index,
    "/ws": {
      GET: (req: Request, server: Server<WsData>) => {
        if (server.upgrade(req, { data: { room: undefined, playerId: undefined } })) return;
        return new Response("upgrade failed", { status: 500 });
      },
    },
  },
  websocket: app.websocket,
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);