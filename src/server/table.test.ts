import { describe, expect, test } from "bun:test";
import type { Card, Deck } from "../shared/cards";
import { Table } from "./table";

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

describe("Table: initial state", () => {
  test("a new table is in the betting phase with full bankrolls", () => {
    const table = new Table([
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ]);
    const state = table.state();
    expect(state.phase).toBe("betting");
    expect(state.round).toBe(1);
    expect(state.players.map((p) => p.bankroll)).toEqual([1000, 1000]);
    expect(state.players.every((p) => p.hands.length === 0)).toBe(true);
  });
});

describe("Table: betting", () => {
  const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }]);

  test("rejects bets below the minimum", () => {
    expect(() => table.placeBet("alice", 5)).toThrow(/below the minimum/i);
  });

  test("rejects bets above the maximum", () => {
    expect(() => table.placeBet("alice", 250)).toThrow(/above the maximum/i);
  });

  test("rejects bets above the bankroll", () => {
    const poor = new Table(
      [{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }],
      { startingBankroll: 100 },
    );
    expect(() => poor.placeBet("alice", 150)).toThrow(/bankroll/i);
  });

  test("rejects a bet from an unknown player", () => {
    expect(() => table.placeBet("eve", 100)).toThrow(/unknown/i);
  });

  test("locks a bet when placed", () => {
    table.placeBet("alice", 100);
    expect(table.state().players[0]!.bet).toBe(100);
  });

  test("rejects a second bet from the same player", () => {
    expect(() => table.placeBet("alice", 100)).toThrow(/already bet/i);
  });

  test("deals once every player has bet", () => {
    table.placeBet("bob", 100);
    const state = table.state();
    expect(state.phase).toBe("acting");
    expect(state.players.every((p) => p.hands.length === 1)).toBe(true);
  });
});

describe("Table: dealing", () => {
  const deck = deckFrom([
    card(10, "spades"), // alice 1
    card(9, "clubs"), // bob 1
    card(6, "diamonds"), // dealer up
    card(7, "hearts"), // alice 2
    card(5, "clubs"), // bob 2
    card(8, "diamonds"), // dealer hole
  ]);
  const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });

  test("deals two cards per player and one up card to the dealer", () => {
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);
    const state = table.state();
    expect(state.players[0]!.hands[0]!.cards).toEqual([card(10, "spades"), card(7, "hearts")]);
    expect(state.players[1]!.hands[0]!.cards).toEqual([card(9, "clubs"), card(5, "clubs")]);
    expect(state.dealer.cards).toEqual([card(6, "diamonds")]);
    expect(state.dealer.holeRevealed).toBe(false);
  });

  test("starts the acting phase with the first player in turn", () => {
    const state = table.state();
    expect(state.phase).toBe("acting");
    expect(state.currentTurn).toBe("alice");
  });
});

describe("Table: acting", () => {
  test("only the current player may act", () => {
    const deck = deckFrom([
      card(10, "spades"),
      card(9, "clubs"),
      card(6, "diamonds"),
      card(7, "hearts"),
      card(5, "clubs"),
      card(8, "diamonds"),
      card(6, "clubs"),
      card(3, "clubs"),
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);
    expect(() => table.hit("bob")).toThrow(/not .* turn/i);
    expect(() => table.stand("bob")).toThrow(/not .* turn/i);
  });

  test("hit adds a card; stand passes the turn", () => {
    const deck = deckFrom([
      card(10, "spades"),
      card(9, "clubs"),
      card(6, "diamonds"),
      card(7, "hearts"),
      card(5, "clubs"),
      card(8, "diamonds"),
      card(6, "clubs"),
      card(3, "clubs"),
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);

    table.stand("alice"); // 17, passes to bob
    let state = table.state();
    expect(state.currentTurn).toBe("bob");

    table.hit("bob"); // 14 + 6 = 20, still active
    state = table.state();
    expect(state.players[1]!.hands[0]!.cards).toHaveLength(3);
    expect(state.players[1]!.hands[0]!.status).toBe("active");
  });

  test("a busted hand is marked and the turn moves on", () => {
    const deck = deckFrom([
      card(10, "spades"),
      card(9, "clubs"),
      card(6, "diamonds"),
      card(5, "hearts"),
      card(5, "clubs"),
      card(8, "diamonds"),
      card(10, "clubs"),
      card(8, "clubs"),
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);

    table.hit("alice");
    const state = table.state();
    expect(state.players[0]!.hands[0]!.status).toBe("busted");
    expect(state.currentTurn).toBe("bob");
  });
});

describe("Table: dealer play", () => {
  test("dealer hits a soft 17", () => {
    const deck = deckFrom([
      card(10, "spades"),
      card(9, "clubs"),
      card("A", "hearts"),
      card(7, "hearts"),
      card(5, "clubs"),
      card(6, "clubs"),
      card(4, "spades"),
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);
    table.stand("alice");
    table.stand("bob");
    const state = table.state();
    expect(state.dealer.cards).toEqual([
      card("A", "hearts"),
      card(6, "clubs"),
      card(4, "spades"),
    ]);
    expect(state.phase).toBe("resolve");
  });

  test("dealer stands on a hard 17", () => {
    const deck = deckFrom([
      card(3, "hearts"),
      card(3, "clubs"),
      card(10, "diamonds"),
      card(4, "hearts"),
      card(4, "clubs"),
      card(7, "clubs"),
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);
    table.stand("alice");
    table.stand("bob");
    const state = table.state();
    expect(state.dealer.cards).toEqual([card(10, "diamonds"), card(7, "clubs")]);
  });

  test("skips dealer play when every player busts", () => {
    const deck = deckFrom([
      card(10, "spades"),
      card(10, "hearts"),
      card(6, "diamonds"),
      card(7, "hearts"),
      card(7, "clubs"),
      card(8, "diamonds"),
      card(6, "clubs"),
      card(5, "clubs"),
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);
    table.hit("alice");
    table.hit("bob");
    const state = table.state();
    expect(state.players.every((p) => p.hands[0]!.status === "busted")).toBe(true);
    expect(state.dealer.cards).toEqual([card(6, "diamonds"), card(8, "diamonds")]);
    expect(state.dealer.holeRevealed).toBe(true);
    expect(state.phase).toBe("resolve");
  });
});

describe("Table: settlement", () => {
  test("pays winners, returns bets on a push, collects on a loss", () => {
    const deck = deckFrom([
      card(10, "spades"), // alice
      card(9, "clubs"), // bob
      card(6, "diamonds"), // dealer up
      card(7, "hearts"), // alice
      card(5, "clubs"), // bob
      card(8, "diamonds"), // dealer hole
      card(6, "clubs"), // bob hits to 20
      card(3, "clubs"), // dealer draws to 17
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);
    table.stand("alice"); // 17 vs dealer 17 -> push
    table.hit("bob"); // 14 + 6 = 20
    table.stand("bob"); // 20 vs 17 -> win

    const state = table.state();
    expect(state.players[0]!.hands[0]!.result).toBe("push");
    expect(state.players[1]!.hands[0]!.result).toBe("won");
    expect(state.players.map((p) => p.bankroll)).toEqual([1000, 1100]);
    expect(state.dealer.holeRevealed).toBe(true);
  });

  test("a busted hand loses its bet", () => {
    const deck = deckFrom([
      card(10, "spades"),
      card(9, "clubs"),
      card(6, "diamonds"),
      card(5, "hearts"),
      card(5, "clubs"),
      card(8, "diamonds"),
      card(10, "clubs"),
      card(8, "clubs"),
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);
    table.hit("alice"); // busts
    table.stand("bob"); // 14 vs dealer busts (8+8=16, draws 8 -> 24)
    const state = table.state();
    expect(state.players[0]!.hands[0]!.result).toBe("lost");
    expect(state.players[1]!.hands[0]!.result).toBe("won");
    expect(state.players.map((p) => p.bankroll)).toEqual([900, 1100]);
  });

  test("a dealer bust pays every standing hand", () => {
    const deck = deckFrom([
      card(10, "spades"),
      card(9, "clubs"),
      card(6, "diamonds"),
      card(7, "hearts"),
      card(5, "clubs"),
      card(8, "diamonds"),
      card(10, "clubs"),
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);
    table.stand("alice"); // 17
    table.stand("bob"); // 14
    const state = table.state();
    expect(state.dealer.cards).toEqual([card(6, "diamonds"), card(8, "diamonds"), card(10, "clubs")]);
    expect(state.players.every((p) => p.hands[0]!.result === "won")).toBe(true);
    expect(state.players.map((p) => p.bankroll)).toEqual([1100, 1100]);
  });
});