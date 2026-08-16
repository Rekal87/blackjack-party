import { serve } from "bun";
import index from "./index.html";
import { Rooms } from "./server/rooms";
import { createDeck } from "./shared/cards";
import type { ServerWebSocket, Server } from "bun";
import type { Room } from "./server/room";

const rooms = new Rooms(() => createDeck(), {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
});

interface ClientMessage {
  type: string;
  name?: string;
  code?: string;
  amount?: number;
  playerId?: string;
}

interface WsData {
  room?: Room;
  playerId?: string;
}

function isClientMessage(data: unknown): data is ClientMessage {
  return typeof data === "object" && data !== null && "type" in data;
}

type Ws = ServerWebSocket<WsData>;

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
  websocket: {
    open(ws) {
      ws.data = { room: undefined, playerId: undefined };
    },
    message(ws, raw) {
      handleMessage(ws, raw);
    },
    close(ws) {
      const { room, playerId } = ws.data;
      if (room && playerId) room.disconnect(playerId);
    },
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

function send(ws: Ws, message: unknown): void {
  ws.send(JSON.stringify(message));
}

function handleMessage(ws: Ws, raw: unknown): void {
  let message: ClientMessage;
  if (typeof raw !== "string") return;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isClientMessage(message)) return;

  const { type, name, code, amount, playerId } = message;
  const state = ws.data;

  try {
    switch (type) {
      case "createRoom": {
        const room = rooms.create(name ?? "Player", ws);
        const playerId = room.state().players.at(-1)!.id;
        state.room = room;
        state.playerId = playerId;
        send(ws, { type: "roomJoined", room: room.state(), playerId });
        break;
      }
      case "join": {
        const room = rooms.join(code ?? "", name ?? "Player", ws);
        const playerId = room.state().players.at(-1)!.id;
        state.room = room;
        state.playerId = playerId;
        send(ws, { type: "roomJoined", room: room.state(), playerId });
        break;
      }
      case "reconnect": {
        const room = rooms.joinRoom(code ?? "", playerId ?? "");
        room.reconnect(playerId!, ws);
        state.room = room;
        state.playerId = playerId;
        break;
      }
      case "startTable":
        state.room!.startTable(state.playerId!);
        break;
      case "restartTable":
        state.room!.restartTable(state.playerId!);
        break;
      case "addBot":
        state.room!.addBot(state.playerId!);
        break;
      case "placeBet":
        state.room!.placeBet(state.playerId!, amount ?? 0);
        break;
      case "hit":
        state.room!.hit(state.playerId!);
        break;
      case "stand":
        state.room!.stand(state.playerId!);
        break;
      case "double":
        state.room!.double(state.playerId!);
        break;
      case "split":
        state.room!.split(state.playerId!);
        break;
      case "endRound":
        state.room!.endRound(state.playerId!);
        break;
      case "endGame":
        state.room!.endGame(state.playerId!);
        break;
      case "leave":
        state.room!.leave(state.playerId!);
        state.room = undefined;
        state.playerId = undefined;
        break;
      default:
        send(ws, { type: "error", message: `unknown message type: ${type}` });
    }
  } catch (error) {
    send(ws, { type: "error", message: error instanceof Error ? error.message : "unknown error" });
  }
}

console.log(`🚀 Server running at ${server.url}`);