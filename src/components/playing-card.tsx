import type { Card } from "@/shared/cards";
import { cn } from "@/lib/utils";

const SUIT_SYMBOL: Record<Card["suit"], string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

export function PlayingCard({ card, hidden }: { card?: Card; hidden?: boolean }) {
  if (hidden || !card) {
    return (
      <div className="flex h-24 w-16 items-center justify-center rounded-lg border border-dashed border-foreground/30 bg-muted/50 text-muted-foreground">
        <span className="text-xl">?</span>
      </div>
    );
  }

  const red = card.suit === "hearts" || card.suit === "diamonds";
  const label = card.rank === 10 ? "10" : String(card.rank);
  return (
    <div
      className={cn(
        "flex h-24 w-16 flex-col justify-between rounded-lg border bg-white p-1.5 shadow",
        red ? "text-red-600" : "text-slate-900",
      )}
    >
      <div className="flex flex-col items-start leading-none">
        <span className="text-base font-bold">{label}</span>
        <span className="text-sm">{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <div className="flex justify-end items-end text-xl leading-none">
        {SUIT_SYMBOL[card.suit]}
      </div>
    </div>
  );
}

export function CardRow({ cards, hiddenCount }: { cards: Card[]; hiddenCount?: number }) {
  const total = cards.length + (hiddenCount ?? 0);
  return (
    <div className="flex flex-wrap gap-1.5">
      {cards.map((card, i) => (
        <PlayingCard key={i} card={card} />
      ))}
      {Array.from({ length: hiddenCount ?? 0 }).map((_, i) => (
        <PlayingCard key={`hidden-${i}`} hidden />
      ))}
      {total === 0 && <span className="text-sm text-muted-foreground">Waiting…</span>}
    </div>
  );
}