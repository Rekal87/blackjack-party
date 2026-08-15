import type { TableState } from "../server/table";
import type { RoomState } from "../server/room";

export type ClientMessage =
  | { type: "createRoom"; name: string }
  | { type: "join"; code: string; name: string }
  | { type: "reconnect"; code: string; playerId: string }
  | { type: "startTable" }
  | { type: "restartTable" }
  | { type: "placeBet"; amount: number }
  | { type: "hit" }
  | { type: "stand" }
  | { type: "double" }
  | { type: "split" }
  | { type: "leave" };

export type ServerMessage =
  | { type: "roomJoined"; room: RoomState; playerId: string }
  | { type: "playerJoined"; player: { id: string; name: string; spectating: boolean; connected: boolean } }
  | { type: "playerLeft"; playerId: string }
  | { type: "playerSpectating"; playerId: string }
  | { type: "playerDisconnected"; playerId: string }
  | { type: "playerReconnected"; playerId: string }
  | { type: "hostChanged"; hostId: string }
  | { type: "gameWon"; winnerId: string; winnerName: string }
  | { type: "tableStarted" }
  | { type: "tableState"; state: TableState }
  | { type: "error"; message: string };