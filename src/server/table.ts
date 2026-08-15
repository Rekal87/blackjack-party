import { createDeck, handValue } from "../shared/cards";
import type { Card, Deck } from "../shared/cards";

export type Phase = "betting" | "acting" | "dealer" | "resolve";
export type HandStatus = "active" | "stood" | "busted";
export type HandResult = "won" | "lost" | "push";

export interface TablePlayer {
  id: string;
  name: string;
  bankroll: number;
  bet: number;
  hands: TableHand[];
}

export interface TableHand {
  cards: Card[];
  status: HandStatus;
  result?: HandResult;
  hiddenCount?: number;
}

export interface TableDealer {
  cards: Card[];
  holeRevealed: boolean;
}

export interface TableState {
  phase: Phase;
  round: number;
  players: TablePlayer[];
  dealer: TableDealer;
  currentTurn: string | null;
}

export interface TableConfig {
  deck?: Deck;
  startingBankroll?: number;
  minBet?: number;
  maxBet?: number;
}

const DEFAULT_BANKROLL = 1000;
const DEFAULT_MIN_BET = 10;
const DEFAULT_MAX_BET = 200;

function value(cards: Card[]) {
  return handValue(cards).total;
}

export class Table {
  private deck: Deck;
  private players: TablePlayer[];
  private dealer: TableDealer;
  private phase: Phase = "betting";
  private round = 1;
  private currentTurnIndex = 0;
  private minBet: number;
  private maxBet: number;

  constructor(players: { id: string; name: string }[], config: TableConfig = {}) {
    this.deck = config.deck ?? createDeck();
    this.players = players.map((p) => ({
      ...p,
      bankroll: config.startingBankroll ?? DEFAULT_BANKROLL,
      bet: 0,
      hands: [],
    }));
    this.dealer = { cards: [], holeRevealed: false };
    this.minBet = config.minBet ?? DEFAULT_MIN_BET;
    this.maxBet = config.maxBet ?? DEFAULT_MAX_BET;
  }

  state(): TableState {
    return {
      phase: this.phase,
      round: this.round,
      players: this.players.map((p) => ({
        ...p,
        hands: p.hands.map((h) => ({ ...h, cards: [...h.cards] })),
      })),
      dealer: {
        cards: this.dealer.holeRevealed
          ? [...this.dealer.cards]
          : this.dealer.cards.slice(0, 1),
        holeRevealed: this.dealer.holeRevealed,
      },
      currentTurn: this.phase === "acting" ? this.players[this.currentTurnIndex]?.id ?? null : null,
    };
  }

  placeBet(playerId: string, amount: number): void {
    if (this.phase !== "betting") throw new Error("not in the betting phase");
    const player = this.findPlayer(playerId);
    if (player.bet > 0) throw new Error("player has already bet");
    if (amount < this.minBet) throw new Error("bet is below the minimum");
    if (amount > this.maxBet) throw new Error("bet is above the maximum");
    if (amount > player.bankroll) throw new Error("bet exceeds bankroll");
    player.bet = amount;
    if (this.players.every((p) => p.bet > 0)) this.deal();
  }

  hit(playerId: string): void {
    if (this.phase !== "acting") throw new Error("not in the acting phase");
    this.assertCurrent(playerId);
    const player = this.currentPlayer();
    const hand = player.hands[0]!;
    const card = this.draw();
    hand.cards.push(card);
    if (value(hand.cards) > 21) {
      hand.status = "busted";
      this.advanceTurn();
    }
  }

  stand(playerId: string): void {
    if (this.phase !== "acting") throw new Error("not in the acting phase");
    this.assertCurrent(playerId);
    const hand = this.currentPlayer().hands[0]!;
    hand.status = "stood";
    this.advanceTurn();
  }

  private findPlayer(playerId: string): TablePlayer {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) throw new Error(`unknown player: ${playerId}`);
    return player;
  }

  private currentPlayer(): TablePlayer {
    return this.players[this.currentTurnIndex]!;
  }

  private assertCurrent(playerId: string): void {
    const current = this.currentPlayer();
    if (current.id !== playerId) throw new Error(`not ${playerId}'s turn`);
  }

  private advanceTurn(): void {
    this.currentTurnIndex++;
    while (this.currentTurnIndex < this.players.length) {
      const hand = this.players[this.currentTurnIndex]!.hands[0];
      if (hand && hand.status === "active") return;
      this.currentTurnIndex++;
    }
    this.dealerPlay();
  }

  private deal(): void {
    this.deck.shuffle();
    for (const player of this.players) {
      player.hands = [{ cards: [], status: "active" }];
    }
    for (const player of this.players) {
      player.hands[0]!.cards.push(this.draw());
    }
    this.dealer = { cards: [this.draw()], holeRevealed: false };
    for (const player of this.players) {
      player.hands[0]!.cards.push(this.draw());
    }
    this.dealer.cards.push(this.draw());
    this.currentTurnIndex = 0;
    this.phase = "acting";
  }

  private dealerPlay(): void {
    this.phase = "dealer";
    const hasLiveHand = this.players.some(
      (p) => p.hands[0] && p.hands[0].status !== "busted",
    );
    if (hasLiveHand) {
      while (this.shouldDealerDraw()) {
        this.dealer.cards.push(this.draw());
      }
    }
    this.resolve();
  }

  private shouldDealerDraw(): boolean {
    const total = value(this.dealer.cards);
    const isSoft = handValue(this.dealer.cards).soft;
    if (total < 17) return true;
    if (total === 17 && isSoft) return true;
    return false;
  }

  private resolve(): void {
    this.phase = "resolve";
    this.dealer.holeRevealed = true;
    const dealerTotal = value(this.dealer.cards);
    const dealerBust = dealerTotal > 21;
    for (const player of this.players) {
      const hand = player.hands[0];
      if (!hand) continue;
      const total = value(hand.cards);
      if (hand.status === "busted" || total > 21) {
        hand.result = "lost";
        player.bankroll -= player.bet;
      } else if (dealerBust) {
        hand.result = "won";
        player.bankroll += player.bet;
      } else if (total === dealerTotal) {
        hand.result = "push";
      } else if (total > dealerTotal) {
        hand.result = "won";
        player.bankroll += player.bet;
      } else {
        hand.result = "lost";
        player.bankroll -= player.bet;
      }
    }
  }

  private draw(): Card {
    const card = this.deck.draw();
    if (!card) throw new Error("deck is empty");
    return card;
  }
}