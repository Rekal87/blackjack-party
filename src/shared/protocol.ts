import type { TableState } from "../server/table";
import type { RoomState } from "../server/room";

export type ClientMessage =
  | { type: "createRoom"; name: string }
  | { type: "join"; code: string; name: string }
  | { type: "startTable" }
  | { type: "placeBet"; amount: number }
  | { type: "hit" }
  | { type: "stand" }
  | { type: "double" }
  | { type: "split" }
  | { type: "leave" };

export type ServerMessage =
  | { type: "roomJoined"; room: RoomState; playerId: string }
  | { type: "playerJoined"; player: { id: string; name: string } }
  | { type: "playerLeft"; playerId: string }
  | { type: "tableStarted" }
  | { type: "tableState"; state: TableState }
  | { type: "error"; message: string };