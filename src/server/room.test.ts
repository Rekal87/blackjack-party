import { describe, expect, test } from "bun:test";
import type { Card, Deck } from "../shared/cards";
import type { TableState, TableConfig } from "./table";
import { Room, filterTableState, BETTING_WINDOW_MS, ROUND_PAUSE_MS } from "./room";
import type { RoomTimers } from "./room";
import { Rooms } from "./rooms";

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

function deckFrom(cards: Card[]): Deck {
  const pile = [...cards];
  return {
    draw: () => pile.shift(),
    shuffle: () => {},
    reshuffle: () => {},
  };
}

class FakeTimers implements RoomTimers {
  time = 0;
  private nextId = 1;
  private queue: { id: number; at: number; fn: () => void }[] = [];

  setTimeout(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.queue.push({ id, at: this.time + ms, fn });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.queue = this.queue.filter((t) => t.id !== handle);
  }

  now(): number {
    return this.time;
  }

  advance(ms: number): void {
    this.time += ms;
    const due = this.queue
      .filter((t) => t.at <= this.time)
      .sort((a, b) => a.at - b.at);
    this.queue = this.queue.filter((t) => t.at > this.time);
    for (const t of due) t.fn();
  }

  pending(): number {
    return this.queue.length;
  }
}

class FakeSocket {
  sent: string[] = [];
  send(data: string): void {
    this.sent.push(data);
  }
  messages(): unknown[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

const DECK = () =>
  deckFrom([
    card(10, "spades"), // alice 1
    card(9, "clubs"), // bob 1
    card(6, "diamonds"), // dealer up
    card(7, "hearts"), // alice 2
    card(5, "clubs"), // bob 2
    card(8, "diamonds"), // dealer hole
    card(6, "clubs"), // bob hit
    card(3, "clubs"), // dealer draw
  ]);

function makeRooms(deck = DECK, timers = new FakeTimers(), tableConfig: TableConfig = {}) {
  return { rooms: new Rooms(deck, timers, tableConfig), timers };
}

describe("Rooms registry", () => {
  test("createRoom assigns a join code and makes its creator the host", () => {
    const rooms = makeRooms().rooms;
    const socket = new FakeSocket();
    const room = rooms.create("Alice", socket);
    expect(room.code).toMatch(/^[A-Z0-9]{4}$/);
    const state = room.state();
    expect(state.players.map((p) => p.name)).toEqual(["Alice"]);
    expect(state.hostId).toBe(state.players[0]!.id);
    expect(state.players[0]!.id).toBe("p1");
  });

  test("join by code adds a player", () => {
    const rooms = makeRooms().rooms;
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    const joined = rooms.join(room.code, "Bob", bobSocket);
    expect(joined).toBe(room);
    expect(room.state().players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
  });

  test("join with an unknown code throws", () => {
    const rooms = makeRooms().rooms;
    expect(() => rooms.join("ZZZZ", "Bob", new FakeSocket())).toThrow(/code/i);
  });

  test("join broadcasts a playerJoined message to everyone", () => {
    const rooms = makeRooms().rooms;
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    rooms.join(room.code, "Bob", new FakeSocket());
    const hostMessages = hostSocket.messages();
    const playerJoined = hostMessages.find((m) => (m as { type: string }).type === "playerJoined");
    expect(playerJoined).toBeDefined();
  });
});

describe("Room lifecycle", () => {
  test("startTable is rejected for a non-host", () => {
    const rooms = makeRooms().rooms;
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    const bobId = room.join("Bob", bobSocket);
    expect(() => room.startTable(bobId)).toThrow(/host/i);
  });

  test("startTable begins a table for the host", () => {
    const rooms = makeRooms().rooms;
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    room.join("Bob", bobSocket);
    room.startTable(room.state().hostId);
    const hostMessages = hostSocket.messages();
    const tableState = hostMessages.find((m) => (m as { type: string }).type === "tableState");
    expect((tableState as { state: TableState }).state.phase).toBe("betting");
  });

  test("leave removes a player and broadcasts playerLeft", () => {
    const rooms = makeRooms().rooms;
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    const bobId = room.join("Bob", bobSocket);
    room.leave(bobId);
    expect(room.state().players.map((p) => p.id)).not.toContain(bobId);
    const playerLeft = hostSocket.messages().find((m) => (m as { type: string }).type === "playerLeft");
    expect(playerLeft).toBeDefined();
  });
});

describe("filterTableState", () => {
  function makeState(): TableState {
    return {
      phase: "acting",
      round: 1,
      players: [
        {
          id: "alice",
          name: "Alice",
          bankroll: 1000,
          bet: 100,
          hands: [{ cards: [card(10, "spades"), card(7, "hearts")], status: "active", bet: 100 }],
        },
        {
          id: "bob",
          name: "Bob",
          bankroll: 1000,
          bet: 100,
          hands: [{ cards: [card(9, "clubs"), card(5, "clubs")], status: "active", bet: 100 }],
        },
      ],
      dealer: { cards: [card(6, "diamonds")], holeRevealed: false },
      currentTurn: "alice",
      currentHand: 0,
    };
  }

  test("the viewer sees their own hand but not others' cards", () => {
    const filtered = filterTableState(makeState(), "alice");
    const alice = filtered.players.find((p) => p.id === "alice")!;
    const bob = filtered.players.find((p) => p.id === "bob")!;
    expect(alice.hands[0]!.cards).toEqual([card(10, "spades"), card(7, "hearts")]);
    expect(bob.hands[0]!.cards).toEqual([]);
    expect(bob.hands[0]!.hiddenCount).toBe(2);
    expect(filtered.dealer.cards).toEqual([card(6, "diamonds")]);
  });

  test("everyone sees all hands and the hole card once resolved", () => {
    const state = makeState();
    state.phase = "resolve";
    state.dealer.holeRevealed = true;
    state.dealer.cards = [card(6, "diamonds"), card(8, "diamonds")];
    const filtered = filterTableState(state, "bob");
    const alice = filtered.players.find((p) => p.id === "alice")!;
    expect(alice.hands[0]!.cards).toEqual([card(10, "spades"), card(7, "hearts")]);
    expect(filtered.dealer.cards).toEqual([card(6, "diamonds"), card(8, "diamonds")]);
  });
});

describe("Room: a full round over the wire", () => {
  test("each player receives filtered snapshots through the round", () => {
    const rooms = makeRooms().rooms;
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    room.join("Bob", bobSocket);
    const hostId = room.state().hostId;
    const bobId = room.state().players[1]!.id;
    room.startTable(hostId);

    room.placeBet(hostId, 100);
    room.placeBet(bobId, 100);

    const hostState = hostSocket.messages()
      .filter((m) => (m as { type: string }).type === "tableState")
      .map((m) => (m as { state: TableState }).state);
    const bobState = bobSocket.messages()
      .filter((m) => (m as { type: string }).type === "tableState")
      .map((m) => (m as { state: TableState }).state);

    const afterDealHost = hostState.at(-1)!;
    const afterDealBob = bobState.at(-1)!;
    expect(afterDealHost.phase).toBe("acting");
    const alice = afterDealHost.players.find((p) => p.id === hostId)!;
    expect(alice.hands[0]!.cards).toHaveLength(2);
    const other = afterDealHost.players.find((p) => p.id !== hostId)!;
    expect(other.hands[0]!.cards).toEqual([]);

    room.stand(hostId); // 17
    room.hit(bobId); // 14 + 6 = 20
    room.stand(bobId);

    const finalHost = hostSocket.messages()
      .filter((m) => (m as { type: string }).type === "tableState")
      .map((m) => (m as { state: TableState }).state)
      .at(-1)!;
    expect(finalHost.phase).toBe("resolve");
    expect(finalHost.players.find((p) => p.id === hostId)!.hands[0]!.cards).toHaveLength(2);
    expect(finalHost.players.find((p) => p.id === bobId)!.hands[0]!.cards).toHaveLength(3);
    expect(finalHost.dealer.holeRevealed).toBe(true);
    const hostResult = finalHost.players.find((p) => p.id === hostId)!.hands[0]!.result;
    const bobResult = finalHost.players.find((p) => p.id === bobId)!.hands[0]!.result;
    expect(hostResult).toBe("push");
    expect(bobResult).toBe("won");
  });
});

describe("Room: betting window & auto-advance", () => {
  test("the betting window expires and auto-deals the round", () => {
    const { rooms, timers } = makeRooms();
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    room.join("Bob", bobSocket);
    const hostId = room.state().hostId;
    room.startTable(hostId);
    expect(timers.pending()).toBe(1);

    room.placeBet(hostId, 100);
    expect(timers.pending()).toBe(1);
    expect(room.state().started).toBe(true);

    timers.advance(BETTING_WINDOW_MS);
    const hostState = hostSocket.messages()
      .filter((m) => (m as { type: string }).type === "tableState")
      .map((m) => (m as { state: TableState }).state)
      .at(-1)!;
    expect(hostState.phase).toBe("acting");
    expect(hostState.players[0]!.hands[0]!.cards).toHaveLength(2);
    expect(hostState.players[1]!.hands).toHaveLength(0);
  });

  test("once everyone has bet the round deals immediately", () => {
    const { rooms, timers } = makeRooms();
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    room.join("Bob", bobSocket);
    const hostId = room.state().hostId;
    const bobId = room.state().players[1]!.id;
    room.startTable(hostId);
    room.placeBet(hostId, 100);
    room.placeBet(bobId, 100);

    const hostState = hostSocket.messages()
      .filter((m) => (m as { type: string }).type === "tableState")
      .map((m) => (m as { state: TableState }).state)
      .at(-1)!;
    expect(hostState.phase).toBe("acting");
    expect(timers.pending()).toBe(0);
  });

  test("the betting window carries a deadline the client can count down", () => {
    const { rooms, timers } = makeRooms();
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    room.startTable(room.state().hostId);
    const hostState = hostSocket.messages()
      .filter((m) => (m as { type: string }).type === "tableState")
      .map((m) => (m as { state: TableState }).state)
      .at(-1)!;
    expect(hostState.bettingEndsAt).toBe(timers.now() + BETTING_WINDOW_MS);
  });

  test("after a round resolves, the next round starts automatically", () => {
    const { rooms, timers } = makeRooms();
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    room.join("Bob", bobSocket);
    const hostId = room.state().hostId;
    const bobId = room.state().players[1]!.id;
    room.startTable(hostId);
    room.placeBet(hostId, 100);
    room.placeBet(bobId, 100);
    room.stand(hostId);
    room.stand(bobId);
    const resolveState = hostSocket.messages()
      .filter((m) => (m as { type: string }).type === "tableState")
      .map((m) => (m as { state: TableState }).state)
      .at(-1)!;
    expect(resolveState.phase).toBe("resolve");

    timers.advance(ROUND_PAUSE_MS);
    const nextState = hostSocket.messages()
      .filter((m) => (m as { type: string }).type === "tableState")
      .map((m) => (m as { state: TableState }).state)
      .at(-1)!;
    expect(nextState.phase).toBe("betting");
    expect(nextState.round).toBe(2);
    expect(nextState.players.every((p) => p.bet === 0)).toBe(true);
  });

  test("a player who drops below the minimum becomes a spectator", () => {
    const deck = () =>
      deckFrom([
        card(10, "spades"), // alice 1 -> 17
        card(9, "clubs"), // bob 1 -> 14
        card(6, "diamonds"), // dealer up
        card(7, "hearts"), // alice 2
        card(5, "clubs"), // bob 2
        card(8, "diamonds"), // dealer hole -> 14
        card(8, "clubs"), // alice hit -> bust
        card(6, "clubs"), // bob hit -> 20
        card(3, "clubs"), // dealer draw -> 17
      ]);
    const { rooms, timers } = makeRooms(deck, new FakeTimers(), { startingBankroll: 100 });
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    room.join("Bob", bobSocket);
    const hostId = room.state().hostId;
    const bobId = room.state().players[1]!.id;
    room.startTable(hostId);
    room.placeBet(hostId, 100);
    room.placeBet(bobId, 100);
    room.hit(hostId); // alice busts
    room.hit(bobId); // bob -> 20
    room.stand(bobId);

    timers.advance(ROUND_PAUSE_MS);
    const playerSpectating = hostSocket.messages().find(
      (m) => (m as { type: string }).type === "playerSpectating",
    );
    expect(playerSpectating).toBeDefined();
    const bobRoster = bobSocket.messages()
      .filter((m) => (m as { type: string }).type === "tableState")
      .map((m) => (m as { state: TableState }).state)
      .at(-1)!;
    expect(bobRoster.players.map((p) => p.id)).toEqual([bobId]);
  });

  test("the last player standing wins the table", () => {
    const deck = () =>
      deckFrom([
        card(10, "spades"), // alice 1 -> 17
        card(9, "clubs"), // bob 1 -> 14
        card(6, "diamonds"), // dealer up
        card(7, "hearts"), // alice 2
        card(5, "clubs"), // bob 2
        card(8, "diamonds"), // dealer hole -> 14
        card(8, "clubs"), // alice hit -> bust
        card(6, "clubs"), // bob hit -> 20
        card(3, "clubs"), // dealer draw -> 17
      ]);
    const { rooms, timers } = makeRooms(deck, new FakeTimers(), { startingBankroll: 100 });
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    room.join("Bob", bobSocket);
    const hostId = room.state().hostId;
    const bobId = room.state().players[1]!.id;
    room.startTable(hostId);
    room.placeBet(hostId, 100);
    room.placeBet(bobId, 100);
    room.hit(hostId);
    room.hit(bobId);
    room.stand(bobId);

    timers.advance(ROUND_PAUSE_MS);
    const gameWon = hostSocket.messages().find((m) => (m as { type: string }).type === "gameWon");
    expect((gameWon as { winnerName?: string } | undefined)?.winnerName).toBe("Bob");
    expect(timers.pending()).toBe(0);
  });

  test("the host can start a fresh table with fresh stacks in the same room", () => {
    const deck = () =>
      deckFrom([
        card(10, "spades"), // alice 1 -> 17
        card(9, "clubs"), // bob 1 -> 14
        card(6, "diamonds"), // dealer up
        card(7, "hearts"), // alice 2
        card(5, "clubs"), // bob 2
        card(8, "diamonds"), // dealer hole -> 14
        card(8, "clubs"), // alice hit -> bust
        card(6, "clubs"), // bob hit -> 20
        card(3, "clubs"), // dealer draw -> 17
        card(4, "spades"), // alice 1 round 2
        card(5, "hearts"), // bob 1 round 2
        card(9, "diamonds"), // dealer up round 2
        card(6, "clubs"), // alice 2 round 2
        card(7, "clubs"), // bob 2 round 2
        card(2, "diamonds"), // dealer hole round 2
      ]);
    const { rooms, timers } = makeRooms(deck);
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    room.join("Bob", bobSocket);
    const hostId = room.state().hostId;
    const bobId = room.state().players[1]!.id;
    room.startTable(hostId);
    room.placeBet(hostId, 100);
    room.placeBet(bobId, 100);
    room.hit(hostId);
    room.hit(bobId);
    room.stand(bobId);

    timers.advance(ROUND_PAUSE_MS);
    expect(timers.pending()).toBe(1);

    room.restartTable(hostId);
    const hostState = hostSocket.messages()
      .filter((m) => (m as { type: string }).type === "tableState")
      .map((m) => (m as { state: TableState }).state)
      .at(-1)!;
    expect(hostState.round).toBe(1);
    expect(hostState.phase).toBe("betting");
    expect(hostState.players.map((p) => p.bankroll)).toEqual([1000, 1000]);
    expect(timers.pending()).toBe(1);
  });

  test("a solo player keeps playing rounds instead of winning the table", () => {
    const { rooms, timers } = makeRooms();
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const hostId = room.state().hostId;
    room.startTable(hostId);
    room.placeBet(hostId, 100);
    room.stand(hostId);

    timers.advance(ROUND_PAUSE_MS);
    const nextState = hostSocket.messages()
      .filter((m) => (m as { type: string }).type === "tableState")
      .map((m) => (m as { state: TableState }).state)
      .at(-1)!;
    expect(nextState.phase).toBe("betting");
    expect(nextState.round).toBe(2);
    const gameWon = hostSocket.messages().find((m) => (m as { type: string }).type === "gameWon");
    expect(gameWon).toBeUndefined();
    expect(timers.pending()).toBe(1);
  });

  test("a non-host cannot restart the table", () => {
    const { rooms } = makeRooms();
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    const bobId = room.join("Bob", bobSocket);
    room.startTable(room.state().hostId);
    expect(() => room.restartTable(bobId)).toThrow(/host/i);
  });
});

describe("Room: disconnect, reconnect & host handover", () => {
  test("a disconnect mid-round auto-stands the player's hand and play continues", () => {
    const deck = () =>
      deckFrom([
        card(10, "spades"), // alice 1
        card(9, "clubs"), // bob 1
        card(6, "diamonds"), // dealer up
        card(7, "hearts"), // alice 2
        card(5, "clubs"), // bob 2
        card(8, "diamonds"), // dealer hole
        card(3, "clubs"), // dealer draw -> 17
      ]);
    const { rooms, timers } = makeRooms(deck);
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    const bobId = room.join("Bob", bobSocket);
    const hostId = room.state().hostId;
    room.startTable(hostId);
    room.placeBet(hostId, 100);
    room.placeBet(bobId, 100);
    expect(room.tableState()!.phase).toBe("acting");
    expect(room.tableState()!.currentTurn).toBe(hostId);

    room.disconnect(hostId); // alice is mid-turn and drops
    const state = room.tableState()!;
    expect(state.players.find((p) => p.id === hostId)!.hands[0]!.status).toBe("stood");
    expect(state.currentTurn).toBe(bobId);
    const disconnected = bobSocket.messages().find((m) => (m as { type: string }).type === "playerDisconnected");
    expect(disconnected).toBeDefined();
  });

  test("a disconnected player can reconnect and keeps their bankroll", () => {
    const deck = () =>
      deckFrom([
        card(10, "spades"), // alice 1 -> 17
        card(9, "clubs"), // bob 1
        card(6, "diamonds"), // dealer up
        card(7, "hearts"), // alice 2
        card(5, "clubs"), // bob 2
        card(8, "diamonds"), // dealer hole -> 14
        card(3, "clubs"), // dealer draw -> 17
      ]);
    const { rooms, timers } = makeRooms(deck);
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    const bobId = room.join("Bob", bobSocket);
    const hostId = room.state().hostId;
    room.startTable(hostId);
    room.placeBet(hostId, 100);
    room.placeBet(bobId, 100);
    room.stand(hostId); // alice pushes (17 vs 17)
    room.stand(bobId);

    room.disconnect(hostId);
    const before = room.tableState()!.players.find((p) => p.id === hostId)!.bankroll;

    const newSocket = new FakeSocket();
    room.reconnect(hostId, newSocket);
    const roomJoined = newSocket.messages().find((m) => (m as { type: string }).type === "roomJoined");
    expect(roomJoined).toBeDefined();
    expect(room.tableState()!.players.find((p) => p.id === hostId)!.bankroll).toBe(before);
    const reconnected = bobSocket.messages().find((m) => (m as { type: string }).type === "playerReconnected");
    expect(reconnected).toBeDefined();
  });

  test("reconnect with an unknown playerId throws", () => {
    const { rooms } = makeRooms();
    const room = rooms.create("Alice", new FakeSocket());
    expect(() => room.reconnect("p99", new FakeSocket())).toThrow(/unknown player/);
  });

  test("if the host leaves, host role passes to the next player", () => {
    const { rooms } = makeRooms();
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    const bobId = room.join("Bob", bobSocket);
    const hostId = room.state().hostId;

    room.leave(hostId);
    expect(room.state().hostId).toBe(bobId);
    const hostChanged = bobSocket.messages().find((m) => (m as { type: string }).type === "hostChanged");
    expect((hostChanged as { hostId?: string } | undefined)?.hostId).toBe(bobId);
  });

  test("if the host disconnects, host role passes to the next connected player", () => {
    const { rooms } = makeRooms();
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    const bobId = room.join("Bob", bobSocket);
    const hostId = room.state().hostId;

    room.disconnect(hostId);
    expect(room.state().hostId).toBe(bobId);
  });

  test("a room survives its host disconnecting", () => {
    const { rooms } = makeRooms();
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    const bobId = room.join("Bob", bobSocket);
    const hostId = room.state().hostId;
    room.startTable(hostId);

    room.disconnect(hostId);
    expect(room.state().players.map((p) => p.id)).toEqual([hostId, bobId]);
    expect(room.state().started).toBe(true);
    expect(room.state().players.find((p) => p.id === hostId)!.connected).toBe(false);
    expect(room.state().players.find((p) => p.id === bobId)!.connected).toBe(true);
    expect(room.state().hostId).toBe(bobId);
  });

  test("reconnecting the new host lets them restart the table", () => {
    const { rooms, timers } = makeRooms();
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    const bobId = room.join("Bob", bobSocket);
    room.startTable(room.state().hostId);

    room.disconnect(room.state().hostId);
    expect(room.state().hostId).toBe(bobId);
    expect(() => room.restartTable(bobId)).not.toThrow();
  });
});