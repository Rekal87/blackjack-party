import { Table } from "./table";
import type { Card, Deck } from "../shared/cards";
import type { TableConfig, TableState } from "./table";

export interface RoomSocket {
  send(data: string): void;
}

export interface RoomPlayer {
  id: string;
  name: string;
  spectating: boolean;
  connected: boolean;
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

export interface RoomTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

const DEFAULT_TIMERS: RoomTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export const BETTING_WINDOW_MS = 20_000;
export const ROUND_PAUSE_MS = 5_000;

export function filterTableState(state: TableState, viewerId: string): TableState {
  const revealed = state.phase === "resolve";
  const isParticipant = state.players.some((p) => p.id === viewerId);
  if (isParticipant && !revealed) {
    return {
      ...state,
      players: state.players.map((player) => {
        if (player.id === viewerId) return player;
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
  return state;
}

export class Room {
  readonly code: string;
  private players: { id: string; name: string; socket: RoomSocket | null; spectating: boolean; connected: boolean }[] = [];
  private hostId: string | null = null;
  private table: Table | null = null;
  private deckFactory: () => Deck;
  private timers: RoomTimers;
  private tableConfig: TableConfig;
  private nextPlayerNumber = 1;
  private bettingTimer: unknown = null;
  private roundTimer: unknown = null;
  private bettingEndsAt: number | null = null;

  constructor(
    code: string,
    deckFactory: () => Deck,
    timers: RoomTimers = DEFAULT_TIMERS,
    tableConfig: TableConfig = {},
  ) {
    this.code = code;
    this.deckFactory = deckFactory;
    this.timers = timers;
    this.tableConfig = tableConfig;
  }

  state(): RoomState {
    return {
      code: this.code,
      hostId: this.hostId!,
      players: this.players.map((p) => ({ id: p.id, name: p.name, spectating: p.spectating, connected: p.connected })),
      started: this.table !== null,
    };
  }

  tableState(): TableState | null {
    return this.table ? this.table.state() : null;
  }

  create(name: string, socket: RoomSocket): string {
    const id = `p${this.nextPlayerNumber++}`;
    this.players.push({ id, name, socket, spectating: false, connected: true });
    this.hostId = id;
    return id;
  }

  join(name: string, socket: RoomSocket): string {
    const id = `p${this.nextPlayerNumber++}`;
    const spectating = this.table !== null;
    this.players.push({ id, name, socket, spectating, connected: true });
    this.broadcast({ type: "playerJoined", player: { id, name, spectating, connected: true } });
    if (spectating && this.table) {
      const raw = this.table.state();
      const filtered = filterTableState(raw, id);
      socket.send(JSON.stringify({ type: "tableState", state: filtered }));
    }
    return id;
  }

  startTable(playerId: string): void {
    if (playerId !== this.hostId) throw new Error("only the host can start the table");
    this.createTable(playerId);
  }

  restartTable(playerId: string): void {
    if (playerId !== this.hostId) throw new Error("only the host can restart the table");
    this.clearBettingTimer();
    this.clearRoundTimer();
    for (const player of this.players) player.spectating = false;
    this.createTable(playerId);
  }

  private createTable(playerId: string): void {
    this.table = new Table(
      this.players.filter((p) => !p.spectating).map((p) => ({ id: p.id, name: p.name })),
      { deck: this.deckFactory(), ...this.tableConfig },
    );
    this.broadcast({ type: "tableStarted" });
    this.beginBetting();
  }

  placeBet(playerId: string, amount: number): void {
    this.table!.placeBet(playerId, amount);
    this.afterTableChange();
  }

  hit(playerId: string): void {
    this.table!.hit(playerId);
    this.afterTableChange();
  }

  stand(playerId: string): void {
    this.table!.stand(playerId);
    this.afterTableChange();
  }

  double(playerId: string): void {
    this.table!.double(playerId);
    this.afterTableChange();
  }

  split(playerId: string): void {
    this.table!.split(playerId);
    this.afterTableChange();
  }

  leave(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;
    this.players = this.players.filter((p) => p.id !== playerId);
    if (this.hostId === playerId) this.hostHandover();
    if (this.table) {
      this.table.removePlayer(playerId);
      this.afterTableChange();
    }
    this.broadcast({ type: "playerLeft", playerId });
  }

  disconnect(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;
    player.socket = null;
    player.connected = false;
    this.broadcast({ type: "playerDisconnected", playerId });
    if (this.hostId === playerId) this.hostHandover();
    if (!this.table) return;
    const state = this.table.state();
    if (state.phase === "acting") {
      this.table.standPlayer(playerId);
      this.afterTableChange();
    }
  }

  reconnect(playerId: string, socket: RoomSocket): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) throw new Error(`unknown player: ${playerId}`);
    player.socket = socket;
    player.connected = true;
    this.broadcast({ type: "playerReconnected", playerId });
    socket.send(JSON.stringify({ type: "roomJoined", room: this.state(), playerId }));
    if (this.table) this.broadcastTableState();
  }

  private hostHandover(): void {
    const next = this.players.find((p) => p.connected);
    if (next) {
      this.hostId = next.id;
      this.broadcast({ type: "hostChanged", hostId: next.id });
    }
  }

  private beginBetting(): void {
    this.clearBettingTimer();
    this.bettingEndsAt = this.timers.now() + BETTING_WINDOW_MS;
    this.bettingTimer = this.timers.setTimeout(() => this.onBettingExpired(), BETTING_WINDOW_MS);
    this.broadcastTableState();
  }

  private onBettingExpired(): void {
    this.bettingTimer = null;
    if (!this.table || this.table.state().phase !== "betting") return;
    this.table.autoDeal();
    this.afterTableChange();
  }

  private afterTableChange(): void {
    if (!this.table) return;
    const phase = this.table.state().phase;
    if (phase !== "betting") this.clearBettingTimer();
    if (phase === "resolve") this.scheduleNextRound();
    if (phase === "acting") this.skipDisconnectedTurn();
    this.broadcastTableState();
  }

  private skipDisconnectedTurn(): void {
    if (!this.table) return;
    let guard = 0;
    while (guard++ < this.players.length) {
      const state = this.table.state();
      if (state.phase !== "acting") return;
      const current = state.currentTurn;
      if (!current) return;
      const player = this.players.find((p) => p.id === current);
      if (player && player.connected) return;
      this.table.standPlayer(current);
    }
  }

  private scheduleNextRound(): void {
    this.clearRoundTimer();
    this.roundTimer = this.timers.setTimeout(() => this.nextRound(), ROUND_PAUSE_MS);
  }

  private nextRound(): void {
    this.roundTimer = null;
    if (!this.table) return;
    const removed = this.table.newRound();
    for (const id of removed) {
      const player = this.players.find((p) => p.id === id);
      if (player) player.spectating = true;
      this.broadcast({ type: "playerSpectating", playerId: id });
    }
    const state = this.table.state();
    if (removed.length > 0 && state.players.length <= 1) {
      const winner = state.players[0];
      if (winner) {
        this.broadcast({ type: "gameWon", winnerId: winner.id, winnerName: winner.name });
      }
      this.broadcastTableState();
      return;
    }
    this.beginBetting();
  }

  private clearBettingTimer(): void {
    if (this.bettingTimer !== null) {
      this.timers.clearTimeout(this.bettingTimer);
      this.bettingTimer = null;
    }
    this.bettingEndsAt = null;
  }

  private clearRoundTimer(): void {
    if (this.roundTimer !== null) {
      this.timers.clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
  }

  private broadcastTableState(): void {
    if (!this.table) return;
    const raw = this.table.state();
    if (raw.phase === "betting" && this.bettingEndsAt !== null) {
      raw.bettingEndsAt = this.bettingEndsAt;
    }
    for (const player of this.players) {
      if (!player.connected || !player.socket) continue;
      const filtered = filterTableState(raw, player.id);
      player.socket.send(JSON.stringify({ type: "tableState", state: filtered }));
    }
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const player of this.players) {
      if (player.connected && player.socket) player.socket.send(data);
    }
  }
}
