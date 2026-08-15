import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThreeTableCanvas } from "./three-table-canvas";
import type { GameConnection } from "@/lib/ws";

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

  const myActiveHand = myTurn && me ? me.hands[table.currentHand] : undefined;
  const canDouble =
    !!myActiveHand &&
    me!.hands.length === 1 &&
    myActiveHand.cards.length === 2 &&
    !myActiveHand.natural &&
    myActiveHand.bet * 2 <= me!.bankroll;
  const canSplit =
    !!myActiveHand &&
    me!.hands.length === 1 &&
    myActiveHand.cards.length === 2 &&
    myActiveHand.cards[0]!.rank === myActiveHand.cards[1]!.rank &&
    myActiveHand.bet * 2 <= me!.bankroll;

  const currentTurnName = table.players.find((p) => p.id === table.currentTurn)?.name;

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1">
        <ThreeTableCanvas table={table} playerId={playerId} />

        <div className="pointer-events-none absolute left-0 top-0 flex w-full items-center justify-between p-4">
          <h1 className="rounded-lg bg-black/40 px-3 py-1.5 text-lg font-bold text-amber-100 backdrop-blur">
            Blackjack Party
          </h1>
          <div className="rounded-lg bg-black/40 px-3 py-1.5 text-sm text-amber-100/90 backdrop-blur">
            Room <span className="font-mono font-semibold">{connection.roomCode}</span> · Round {table.round}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-4 right-4 flex flex-col gap-1.5 text-right">
          {table.players.map((p) => (
            <div
              key={p.id}
              className={
                "rounded-md px-2.5 py-1 text-xs backdrop-blur " +
                (table.currentTurn === p.id && table.phase === "acting"
                  ? "bg-amber-500/80 text-black"
                  : "bg-black/45 text-amber-100/90")
              }
            >
              <span className="font-semibold">{p.name}</span>
              <span className="ml-1.5 opacity-80">{p.bankroll}</span>
              {p.id === playerId && <span className="ml-1 opacity-60">(you)</span>}
            </div>
          ))}
        </div>

        <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3">
          {betting && me && me.bet === 0 && (
            <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-black/50 p-3 backdrop-blur">
              <Input
                type="number"
                min={10}
                max={200}
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                className="w-28"
                aria-label="Bet amount"
              />
              <Button onClick={() => connection.send({ type: "placeBet", amount })} disabled={!canBet}>
                Place Bet
              </Button>
            </div>
          )}
          {betting && me && me.bet > 0 && (
            <p className="rounded-md bg-black/50 px-3 py-1.5 text-sm text-amber-100 backdrop-blur">
              Waiting for everyone to bet…
            </p>
          )}
          {myTurn && (
            <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-black/50 p-3 backdrop-blur">
              <Button onClick={() => connection.send({ type: "hit" })}>Hit</Button>
              <Button variant="secondary" onClick={() => connection.send({ type: "stand" })}>
                Stand
              </Button>
              {canDouble && (
                <Button variant="secondary" onClick={() => connection.send({ type: "double" })}>
                  Double
                </Button>
              )}
              {canSplit && (
                <Button variant="secondary" onClick={() => connection.send({ type: "split" })}>
                  Split
                </Button>
              )}
            </div>
          )}
          {isDealerPlaying && (
            <p className="rounded-md bg-black/50 px-3 py-1.5 text-sm text-amber-100 backdrop-blur">
              Dealer is playing…
            </p>
          )}
          {table.phase === "acting" && !myTurn && (
            <p className="rounded-md bg-black/50 px-3 py-1.5 text-sm text-amber-100 backdrop-blur">
              Waiting for {currentTurnName}…
            </p>
          )}
          {table.phase === "resolve" && (
            <p className="rounded-md bg-black/50 px-3 py-1.5 text-sm font-medium text-amber-100 backdrop-blur">
              Round complete.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}