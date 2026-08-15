import { Table } from "./table";
import type { Card, Deck } from "../shared/cards";
import type { TableState } from "./table";

export interface RoomSocket {
  send(data: string): void;
}

export interface RoomPlayer {
  id: string;
  name: string;
}

export interface RoomState {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  started: boolean;
}

export interface ServerMessage {
  type: string;
  [key: string]: unknown;
}

export function filterTableState(state: TableState, viewerId: string): TableState {
  const revealed = state.phase === "resolve";
  return {
    ...state,
    players: state.players.map((player) => {
      if (player.id === viewerId || revealed) return player;
      return {
        ...player,
        hands: player.hands.map((hand) => ({
          ...hand,
          cards: [],
          hiddenCount: hand.cards.length,
          natural: undefined,
          result: undefined,
        })),
      };
    }),
  };
}

export class Room {
  readonly code: string;
  private players: { id: string; name: string; socket: RoomSocket }[] = [];
  private hostId: string | null = null;
  private table: Table | null = null;
  private deckFactory: () => Deck;
  private nextPlayerNumber = 1;

  constructor(code: string, deckFactory: () => Deck) {
    this.code = code;
    this.deckFactory = deckFactory;
  }

  state(): RoomState {
    return {
      code: this.code,
      hostId: this.hostId!,
      players: this.players.map((p) => ({ id: p.id, name: p.name })),
      started: this.table !== null,
    };
  }

  create(name: string, socket: RoomSocket): string {
    const id = `p${this.nextPlayerNumber++}`;
    this.players.push({ id, name, socket });
    this.hostId = id;
    return id;
  }

  join(name: string, socket: RoomSocket): string {
    const id = `p${this.nextPlayerNumber++}`;
    this.players.push({ id, name, socket });
    this.broadcast({ type: "playerJoined", player: { id, name } });
    return id;
  }

  startTable(playerId: string): void {
    if (playerId !== this.hostId) throw new Error("only the host can start the table");
    this.table = new Table(
      this.players.map((p) => ({ id: p.id, name: p.name })),
      { deck: this.deckFactory() },
    );
    this.broadcast({ type: "tableStarted" });
    this.broadcastTableState();
  }

  placeBet(playerId: string, amount: number): void {
    this.table!.placeBet(playerId, amount);
    this.broadcastTableState();
  }

  hit(playerId: string): void {
    this.table!.hit(playerId);
    this.broadcastTableState();
  }

  stand(playerId: string): void {
    this.table!.stand(playerId);
    this.broadcastTableState();
  }

  double(playerId: string): void {
    this.table!.double(playerId);
    this.broadcastTableState();
  }

  split(playerId: string): void {
    this.table!.split(playerId);
    this.broadcastTableState();
  }

  leave(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;
    this.players = this.players.filter((p) => p.id !== playerId);
    this.broadcast({ type: "playerLeft", playerId });
  }

  private broadcastTableState(): void {
    if (!this.table) return;
    for (const player of this.players) {
      const filtered = filterTableState(this.table.state(), player.id);
      player.socket.send(JSON.stringify({ type: "tableState", state: filtered }));
    }
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const player of this.players) {
      player.socket.send(data);
    }
  }
}