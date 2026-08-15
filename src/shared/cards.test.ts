import { describe, expect, test } from "bun:test";
import type { Card } from "./cards";
import { createDeck, handValue } from "./cards";

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Deck", () => {
  test("a new deck contains 52 unique cards (4 suits x 13 ranks)", () => {
    const deck = createDeck();
    const drawn: Card[] = [];
    let cardCount = 0;
    while (cardCount < 52) {
      const c = deck.draw();
      expect(c).toBeDefined();
      drawn.push(c!);
      cardCount++;
    }
    expect(deck.draw()).toBeUndefined();
    expect(drawn).toHaveLength(52);
    const unique = new Set(drawn.map((c) => `${c.rank}${c.suit}`));
    expect(unique.size).toBe(52);
  });

  test("shuffle with a seeded rng is deterministic", () => {
    const a = createDeck();
    const b = createDeck();
    a.shuffle(mulberry32(42));
    b.shuffle(mulberry32(42));
    const orderA = Array.from({ length: 52 }, () => a.draw()!);
    const orderB = Array.from({ length: 52 }, () => b.draw()!);
    expect(orderA).toEqual(orderB);
  });

  test("shuffle with different seeds yields different orders", () => {
    const a = createDeck();
    const b = createDeck();
    a.shuffle(mulberry32(1));
    b.shuffle(mulberry32(2));
    const orderA = Array.from({ length: 52 }, () => a.draw()!);
    const orderB = Array.from({ length: 52 }, () => b.draw()!);
    expect(orderA).not.toEqual(orderB);
  });

  test("reshuffle returns the full deck to play", () => {
    const deck = createDeck();
    deck.draw();
    deck.draw();
    deck.reshuffle(mulberry32(7));
    let count = 0;
    while (deck.draw()) count++;
    expect(count).toBe(52);
  });
});

describe("handValue", () => {
  test("values simple numeric hands", () => {
    expect(handValue([card(5, "hearts"), card(9, "diamonds")])).toEqual({ total: 14, soft: false });
  });

  test("values face cards as 10", () => {
    expect(handValue([card("K", "hearts"), card(6, "spades")])).toEqual({ total: 16, soft: false });
    expect(handValue([card("K", "hearts"), card("Q", "diamonds")])).toEqual({ total: 20, soft: false });
  });

  test("counts an ace as 11 when it doesn't bust", () => {
    expect(handValue([card("A", "hearts"), card(6, "spades")])).toEqual({ total: 17, soft: true });
  });

  test("counts an ace as 1 when 11 would bust", () => {
    expect(handValue([card("A", "hearts"), card(10, "spades"), card(5, "clubs")])).toEqual({
      total: 16,
      soft: false,
    });
  });

  test("handles multiple aces with the best total", () => {
    expect(handValue([card("A", "hearts"), card("A", "diamonds")])).toEqual({ total: 12, soft: true });
    expect(handValue([card("A", "hearts"), card("A", "diamonds"), card("A", "clubs")])).toEqual({
      total: 13,
      soft: true,
    });
  });

  test("scores a natural as a soft 21", () => {
    expect(handValue([card("A", "hearts"), card(10, "spades")])).toEqual({ total: 21, soft: true });
  });

  test("scores a five-card 21 as a hard 21", () => {
    expect(handValue([card(10, "hearts"), card(5, "spades"), card(6, "clubs")])).toEqual({
      total: 21,
      soft: false,
    });
  });

  test("reports an empty hand as 0, hard", () => {
    expect(handValue([])).toEqual({ total: 0, soft: false });
  });
});