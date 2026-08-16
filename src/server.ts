import { serve } from "bun";
import { createGameApp } from "@/server/app";
import type { WsData } from "@/server/app";

const app = createGameApp();

const server = serve<WsData>({
  port: Number(process.env.PORT) || 4000,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (server.upgrade(req, { data: { room: undefined, playerId: undefined } })) return;
      return new Response("upgrade failed", { status: 500 });
    }

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(`dist${pathname}`);
    if (await file.exists()) return new Response(file);

    const indexFile = Bun.file("dist/index.html");
    if (await indexFile.exists()) return new Response(indexFile);

    return new Response("Not found", { status: 404 });
  },
  websocket: app.websocket,
});

console.log(`🚀 Server running at ${server.url}`);