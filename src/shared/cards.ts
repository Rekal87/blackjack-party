export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | "J" | "Q" | "K" | "A";
export type Suit = "hearts" | "diamonds" | "clubs" | "spades";

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface HandValue {
  total: number;
  soft: boolean;
}

const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K", "A"];
const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];

function makeDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export interface Deck {
  draw(): Card | undefined;
  shuffle(rng?: () => number): void;
  reshuffle(rng?: () => number): void;
}

export function createDeck(): Deck {
  let cards = makeDeck();
  return {
    draw() {
      return cards.pop();
    },
    shuffle(rng = Math.random) {
      cards = shuffle(cards, rng);
    },
    reshuffle(rng = Math.random) {
      cards = shuffle(makeDeck(), rng);
    },
  };
}

export function handValue(cards: Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === "A") {
      aces++;
      total += 1;
    } else if (typeof card.rank === "number") {
      total += card.rank;
    } else {
      total += 10;
    }
  }
  let soft = false;
  for (let i = 0; i < aces; i++) {
    if (total + 10 <= 21) {
      total += 10;
      soft = true;
    }
  }
  return { total, soft };
}