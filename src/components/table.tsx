import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardRow } from "./playing-card";
import type { GameConnection } from "@/lib/ws";
import type { TableState } from "@/server/table";
import type { Card } from "@/shared/cards";

export function Table({ connection, playerId }: { connection: GameConnection; playerId: string }) {
  const table = connection.table;
  const [betAmount, setBetAmount] = useState("100");

  if (!table) return <p className="text-center text-muted-foreground">Waiting for the table…</p>;

  const me = table.players.find((p) => p.id === playerId);
  const myTurn = table.phase === "acting" && table.currentTurn === playerId;
  const betting = table.phase === "betting";
  const isDealerPlaying = table.phase === "dealer";

  const amount = Number(betAmount);
  const canBet = betting && !!me && me.bet === 0 && amount > 0;

  const renderTable = (table: TableState) => {
    return (
    <div className="flex min-h-screen w-full flex-col items-center gap-8 p-6">
      <div className="flex w-full max-w-4xl items-center justify-between">
        <h1 className="text-2xl font-bold">Blackjack Party</h1>
        <div className="text-sm text-muted-foreground">
          Room <span className="font-mono font-semibold text-foreground">{connection.roomCode}</span> · Round{" "}
          {table.round}
        </div>
      </div>

      <div className="flex w-full max-w-4xl flex-col gap-10">
        <section className="flex flex-col items-center gap-3">
          <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Dealer</h2>
          <CardRow cards={table.dealer.cards} />
          <div className="text-sm font-semibold">
            {table.dealer.holeRevealed && (
              <span>{table.dealer.cards.reduce((sum, c) => sum + cardValue(c), 0)}</span>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {table.players.map((p) => {
            const isMe = p.id === playerId;
            const hand = p.hands[0];
            return (
              <div
                key={p.id}
                className={
                  "rounded-xl border p-4 " + (table.currentTurn === p.id && table.phase === "acting"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card")
                }
              >
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className={"font-semibold " + (isMe ? "text-primary" : "")}>
                    {p.name}
                    {isMe ? " (you)" : ""}
                  </span>
                  <span className="text-muted-foreground">
                    {p.bankroll} chips{isMe ? ` · bet ${p.bet}` : ""}
                  </span>
                </div>
                {hand && (
                  <>
                    <CardRow cards={hand.cards} hiddenCount={hand.hiddenCount} />
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      {hand.status !== "active" && (
                        <span
                          className={
                            "rounded px-1.5 py-0.5 font-medium " +
                            (hand.status === "busted"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground")
                          }
                        >
                          {hand.status}
                        </span>
                      )}
                      {hand.result && (
                        <span
                          className={
                            "rounded px-1.5 py-0.5 font-medium " +
                            (hand.result === "won"
                              ? "bg-emerald-500/10 text-emerald-600"
                              : hand.result === "lost"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground")
                          }
                        >
                          {hand.result}
                        </span>
                      )}
                    </div>
                  </>
                )}
                {!hand && <p className="text-sm text-muted-foreground">Waiting for cards…</p>}
              </div>
            );
          })}
        </section>

        <section className="flex flex-col items-center gap-3">
          {betting && me && me.bet === 0 && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={10}
                max={200}
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                className="w-32"
                aria-label="Bet amount"
              />
              <Button onClick={() => connection.send({ type: "placeBet", amount })} disabled={!canBet}>
                Place Bet
              </Button>
            </div>
          )}
          {betting && me && me.bet > 0 && <p className="text-sm text-muted-foreground">Waiting for everyone to bet…</p>}
          {myTurn && (
            <div className="flex items-center gap-3">
              <Button onClick={() => connection.send({ type: "hit" })}>Hit</Button>
              <Button variant="secondary" onClick={() => connection.send({ type: "stand" })}>
                Stand
              </Button>
            </div>
          )}
          {isDealerPlaying && <p className="text-sm text-muted-foreground">Dealer is playing…</p>}
          {table.phase === "acting" && !myTurn && (
            <p className="text-sm text-muted-foreground">
              Waiting for {table.players.find((p) => p.id === table.currentTurn)?.name}…
            </p>
          )}
          {table.phase === "resolve" && <p className="text-sm font-medium text-muted-foreground">Round complete.</p>}
        </section>
      </div>
    </div>
    );
  };

  return renderTable(table);
}

function cardValue(card: Card): number {
  if (card.rank === "A") return 1;
  if (typeof card.rank === "number") return card.rank;
  return 10;
}