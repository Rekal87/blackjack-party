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

describe("Table: naturals", () => {
  test("a starting natural pays 3:2", () => {
    const deck = deckFrom([
      card("A", "spades"),
      card(6, "diamonds"), // dealer up
      card("K", "hearts"),
      card(7, "spades"), // dealer hole
      card(4, "spades"), // dealer draws to 17
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }], { deck });
    table.placeBet("alice", 100);
    const state = table.state();
    expect(state.players[0]!.hands[0]!.natural).toBe(true);
    expect(state.players[0]!.hands[0]!.status).toBe("stood");
    expect(state.players[0]!.hands[0]!.result).toBe("won");
    expect(state.players[0]!.bankroll).toBe(1150);
    expect(state.phase).toBe("resolve");
  });

  test("natural vs natural is a push", () => {
    const deck = deckFrom([
      card("A", "spades"),
      card(10, "clubs"),
      card("A", "diamonds"), // dealer up
      card("K", "hearts"),
      card(5, "clubs"),
      card(10, "spades"), // dealer hole -> natural
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);
    // alice's natural is auto-stood; bob is up
    expect(table.state().currentTurn).toBe("bob");
    table.stand("bob");
    const state = table.state();
    expect(state.players[0]!.hands[0]!.result).toBe("push");
    expect(state.players[0]!.bankroll).toBe(1000);
    expect(state.players[1]!.hands[0]!.result).toBe("lost");
    expect(state.players[1]!.bankroll).toBe(900);
  });

  test("a natural hand is skipped in turn order", () => {
    const deck = deckFrom([
      card("A", "spades"),
      card(9, "clubs"),
      card(6, "diamonds"),
      card("K", "hearts"),
      card(5, "clubs"),
      card(8, "diamonds"),
      card(3, "clubs"), // dealer draws to 17
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);
    expect(table.state().currentTurn).toBe("bob");
  });
});

describe("Table: double", () => {
  test("double doubles the bet, takes one card, and ends the hand", () => {
    const deck = deckFrom([
      card(10, "spades"),
      card(6, "diamonds"), // dealer up
      card(7, "clubs"),
      card(7, "spades"), // dealer hole
      card(3, "spades"), // double card -> 20
      card(4, "clubs"), // dealer draws to 17
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }], { deck });
    table.placeBet("alice", 100);
    table.double("alice");
    const hand = table.state().players[0]!.hands[0]!;
    expect(hand.bet).toBe(200);
    expect(hand.cards).toHaveLength(3);
    expect(hand.status).toBe("stood");
    expect(hand.result).toBe("won");
    expect(table.state().players[0]!.bankroll).toBe(1200);
  });

  test("a double that busts loses the doubled bet", () => {
    const deck = deckFrom([
      card(10, "spades"),
      card(6, "diamonds"),
      card(7, "clubs"),
      card(7, "spades"),
      card(8, "clubs"), // double card -> 25, bust
      card(8, "diamonds"), // dealer draws to 21
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }], { deck });
    table.placeBet("alice", 100);
    table.double("alice");
    const state = table.state();
    expect(state.players[0]!.hands[0]!.status).toBe("busted");
    expect(state.players[0]!.hands[0]!.result).toBe("lost");
    expect(state.players[0]!.bankroll).toBe(800);
  });

  test("double is rejected after a hit", () => {
    const deck = deckFrom([
      card(9, "spades"),
      card(6, "diamonds"),
      card(8, "clubs"),
      card(7, "spades"),
      card(3, "hearts"), // hit -> 20
      card(5, "clubs"),
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }], { deck });
    table.placeBet("alice", 100);
    table.hit("alice");
    expect(() => table.double("alice")).toThrow(/double/i);
  });

  test("double is rejected when not the current player", () => {
    const deck = deckFrom([
      card(10, "spades"),
      card(9, "clubs"),
      card(6, "diamonds"),
      card(7, "clubs"),
      card(5, "clubs"),
      card(8, "diamonds"),
      card(4, "spades"),
      card(3, "clubs"),
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);
    expect(() => table.double("bob")).toThrow(/turn/i);
  });
});

describe("Table: split", () => {
  test("splits a pair into two hands played in turn order", () => {
    const deck = deckFrom([
      card(8, "spades"),
      card(6, "diamonds"),
      card(8, "clubs"),
      card(7, "spades"),
      card(3, "spades"), // hand 1 hit -> 11
      card(2, "hearts"), // hand 2 hit -> 10
      card(5, "clubs"), // hand 2 hit -> 15
      card(6, "clubs"), // hand 2 hit -> 21
      card(4, "spades"), // dealer draws to 17
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }], { deck });
    table.placeBet("alice", 100);
    table.split("alice");
    let state = table.state();
    expect(state.players[0]!.hands).toHaveLength(2);
    expect(state.currentTurn).toBe("alice");
    expect(state.currentHand).toBe(0);

    table.hit("alice"); // hand 1: 11
    table.stand("alice");
    state = table.state();
    expect(state.currentTurn).toBe("alice");
    expect(state.currentHand).toBe(1);

    table.hit("alice"); // hand 2: 10
    table.hit("alice"); // hand 2: 15
    table.hit("alice"); // hand 2: 21
    table.stand("alice");
    state = table.state();
    expect(state.phase).toBe("resolve");
    expect(state.players[0]!.hands[0]!.result).toBe("lost"); // 11 vs 17
    expect(state.players[0]!.hands[1]!.result).toBe("won"); // 21 vs 17
    expect(state.players[0]!.hands[1]!.natural).toBeUndefined();
    expect(state.players[0]!.bankroll).toBe(1000); // -100 + 100 (even money, not 3:2)
  });

  test("split hands each carry the original bet", () => {
    const deck = deckFrom([
      card(8, "spades"),
      card(6, "diamonds"),
      card(8, "clubs"),
      card(7, "spades"),
      card(10, "hearts"),
      card(10, "clubs"),
      card(10, "diamonds"),
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }], { deck });
    table.placeBet("alice", 100);
    table.split("alice");
    const hands = table.state().players[0]!.hands;
    expect(hands.map((h) => h.bet)).toEqual([100, 100]);
  });

  test("split is rejected on non-pairs and after a prior split", () => {
    const deck = deckFrom([
      card(9, "spades"),
      card(6, "diamonds"),
      card(8, "clubs"),
      card(7, "spades"),
      card(4, "clubs"),
      card(5, "hearts"),
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }], { deck });
    table.placeBet("alice", 100);
    expect(() => table.split("alice")).toThrow(/pair/i);

    const pairDeck = deckFrom([
      card(8, "spades"),
      card(6, "diamonds"),
      card(8, "clubs"),
      card(7, "spades"),
      card(3, "spades"),
      card(4, "clubs"),
    ]);
    const paired = new Table([{ id: "alice", name: "Alice" }], { deck: pairDeck });
    paired.placeBet("alice", 100);
    paired.split("alice");
    expect(() => paired.split("alice")).toThrow(/re-split|split/i);
  });

  test("splitting aces deals one card each and ends both hands", () => {
    const deck = deckFrom([
      card("A", "spades"),
      card(6, "diamonds"),
      card("A", "clubs"),
      card(7, "spades"),
      card(8, "spades"), // hand 1 second card
      card(9, "clubs"), // hand 2 second card
      card(4, "spades"), // dealer draws to 17
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }], { deck });
    table.placeBet("alice", 100);
    table.split("alice");
    const state = table.state();
    const hands = state.players[0]!.hands;
    expect(hands.map((h) => h.cards)).toEqual([
      [card("A", "spades"), card(8, "spades")],
      [card("A", "clubs"), card(9, "clubs")],
    ]);
    expect(hands.every((h) => h.status === "stood")).toBe(true);
    expect(hands.every((h) => h.result === "won")).toBe(true);
    expect(state.players[0]!.bankroll).toBe(1200);
    expect(state.phase).toBe("resolve");
  });

  test("double is rejected after a split", () => {
    const deck = deckFrom([
      card(8, "spades"),
      card(6, "diamonds"),
      card(8, "clubs"),
      card(7, "spades"),
      card(3, "spades"),
      card(4, "clubs"),
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }], { deck });
    table.placeBet("alice", 100);
    table.split("alice");
    expect(() => table.double("alice")).toThrow(/split/i);
  });
});

describe("Table: betting window & auto-deal", () => {
  test("autoDeal deals the round even when not everyone has bet", () => {
    const deck = deckFrom([
      card(10, "spades"), // alice 1
      card(9, "clubs"), // bob 1
      card(6, "diamonds"), // dealer up
      card(7, "hearts"), // alice 2
      card(5, "clubs"), // bob 2
      card(8, "diamonds"), // dealer hole
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });
    table.placeBet("alice", 100);
    expect(table.state().phase).toBe("betting");

    table.autoDeal();
    const state = table.state();
    expect(state.phase).toBe("acting");
    expect(state.players[0]!.hands[0]!.cards).toHaveLength(2);
    expect(state.players[1]!.hands).toHaveLength(0);
  });

  test("autoDeal is a no-op outside the betting phase", () => {
    const deck = deckFrom([
      card(10, "spades"),
      card(6, "diamonds"),
      card(7, "hearts"),
      card(8, "diamonds"),
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }], { deck });
    table.placeBet("alice", 100);
    expect(table.state().phase).toBe("acting");
    const before = table.state();
    table.autoDeal();
    expect(table.state()).toEqual(before);
  });
});

describe("Table: new round", () => {
  test("newRound clears bets and rotates the starting turn", () => {
    const deck = deckFrom([
      card(10, "spades"), // alice 1
      card(9, "clubs"), // bob 1
      card(6, "diamonds"), // dealer up
      card(7, "hearts"), // alice 2
      card(5, "clubs"), // bob 2
      card(8, "diamonds"), // dealer hole
      card(3, "clubs"), // dealer draw to 17
      card(4, "spades"), // alice 1 round 2
      card(5, "hearts"), // bob 1 round 2
      card(9, "diamonds"), // dealer up round 2
      card(6, "clubs"), // alice 2 round 2
      card(7, "clubs"), // bob 2 round 2
      card(2, "diamonds"), // dealer hole round 2
    ]);
    const table = new Table([{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], { deck });
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);
    table.stand("alice");
    table.stand("bob");
    expect(table.state().phase).toBe("resolve");

    table.newRound();
    expect(table.state().round).toBe(2);
    expect(table.state().phase).toBe("betting");
    expect(table.state().players.every((p) => p.bet === 0 && p.hands.length === 0)).toBe(true);

    table.placeBet("alice", 100);
    table.placeBet("bob", 100);
    expect(table.state().currentTurn).toBe("bob");
  });

  test("newRound removes players whose bankroll fell below the minimum", () => {
    const deck = deckFrom([
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
    const table = new Table(
      [
        { id: "alice", name: "Alice" },
        { id: "bob", name: "Bob" },
      ],
      { deck, startingBankroll: 100 },
    );
    table.placeBet("alice", 100);
    table.placeBet("bob", 100);
    table.hit("alice"); // 25, busts
    table.hit("bob"); // 20, still active
    table.stand("bob"); // 20 beats 17
    expect(table.state().players.find((p) => p.id === "alice")!.bankroll).toBe(0);

    const removed = table.newRound();
    expect(removed).toEqual(["alice"]);
    expect(table.state().players.map((p) => p.id)).toEqual(["bob"]);
  });
});