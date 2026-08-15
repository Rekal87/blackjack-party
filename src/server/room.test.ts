import { describe, expect, test } from "bun:test";
import type { Card, Deck } from "../shared/cards";
import type { TableState } from "./table";
import { Room, filterTableState } from "./room";
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

describe("Rooms registry", () => {
  test("createRoom assigns a join code and makes its creator the host", () => {
    const rooms = new Rooms(DECK);
    const socket = new FakeSocket();
    const room = rooms.create("Alice", socket);
    expect(room.code).toMatch(/^[A-Z0-9]{4}$/);
    const state = room.state();
    expect(state.players.map((p) => p.name)).toEqual(["Alice"]);
    expect(state.hostId).toBe(state.players[0]!.id);
    expect(state.players[0]!.id).toBe("p1");
  });

  test("join by code adds a player", () => {
    const rooms = new Rooms(DECK);
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    const joined = rooms.join(room.code, "Bob", bobSocket);
    expect(joined).toBe(room);
    expect(room.state().players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
  });

  test("join with an unknown code throws", () => {
    const rooms = new Rooms(DECK);
    expect(() => rooms.join("ZZZZ", "Bob", new FakeSocket())).toThrow(/code/i);
  });

  test("join broadcasts a playerJoined message to everyone", () => {
    const rooms = new Rooms(DECK);
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
    const rooms = new Rooms(DECK);
    const hostSocket = new FakeSocket();
    const room = rooms.create("Alice", hostSocket);
    const bobSocket = new FakeSocket();
    const bobId = room.join("Bob", bobSocket);
    expect(() => room.startTable(bobId)).toThrow(/host/i);
  });

  test("startTable begins a table for the host", () => {
    const rooms = new Rooms(DECK);
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
    const rooms = new Rooms(DECK);
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
    const rooms = new Rooms(DECK);
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