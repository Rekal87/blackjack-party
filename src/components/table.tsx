import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThreeTableCanvas } from "./three-table-canvas";
import type { GameConnection } from "@/lib/ws";

export function Table({ connection, playerId }: { connection: GameConnection; playerId: string }) {
  const table = connection.table;
  const [betAmount, setBetAmount] = useState("100");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (table?.phase !== "betting") return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [table?.phase, table?.bettingEndsAt]);

  if (!table) return <p className="text-center text-muted-foreground">Waiting for the table…</p>;

  const me = table.players.find((p) => p.id === playerId);
  const myTurn = table.phase === "acting" && table.currentTurn === playerId;
  const betting = table.phase === "betting";
  const isDealerPlaying = table.phase === "dealer";
  const amHost = playerId === connection.hostId;
  const amSpectating = !me;

  const amount = Number(betAmount);
  const canBet = betting && !!me && me.bet === 0 && amount > 0;

  const secondsLeft =
    betting && table.bettingEndsAt ? Math.max(0, Math.ceil((table.bettingEndsAt - now) / 1000)) : null;

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
          {connection.roster.map((p) => {
            const seated = table.players.find((tp) => tp.id === p.id);
            return (
              <div
                key={p.id}
                className={
                  "rounded-md px-2.5 py-1 text-xs backdrop-blur " +
                  (table.currentTurn === p.id && table.phase === "acting"
                    ? "bg-amber-500/80 text-black"
                    : p.spectating
                      ? "bg-black/45 text-amber-100/50"
                      : "bg-black/45 text-amber-100/90")
                }
              >
                <span className="font-semibold">{p.name}</span>
                {seated ? (
                  <span className="ml-1.5 opacity-80">{seated.bankroll}</span>
                ) : (
                  <span className="ml-1.5 text-amber-200/60">spectating</span>
                )}
                {!p.connected && <span className="ml-1.5 text-red-300/80">offline</span>}
                {p.id === playerId && <span className="ml-1 opacity-60">(you)</span>}
              </div>
            );
          })}
        </div>

        <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3">
          {connection.gameWon && (
            <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-xl bg-black/60 p-4 text-center backdrop-blur">
              <p className="text-lg font-bold text-amber-100">
                {connection.gameWon.winnerName} wins the table!
              </p>
              {amHost ? (
                <Button onClick={() => connection.send({ type: "restartTable" })}>
                  Start New Table
                </Button>
              ) : (
                <p className="text-sm text-amber-100/80">Waiting for the host to start a new table…</p>
              )}
            </div>
          )}
          {betting && !connection.gameWon && (
            <>
              {amSpectating && (
                <p className="rounded-md bg-black/50 px-3 py-1.5 text-sm text-amber-100/80 backdrop-blur">
                  Your bankroll fell below the minimum bet — you're spectating.
                </p>
              )}
              {!amSpectating && me && me.bet === 0 && (
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
                  {secondsLeft !== null && (
                    <span className="w-16 text-right text-sm text-amber-100/80">
                      {secondsLeft}s
                    </span>
                  )}
                </div>
              )}
              {!amSpectating && me && me.bet > 0 && (
                <p className="rounded-md bg-black/50 px-3 py-1.5 text-sm text-amber-100 backdrop-blur">
                  Waiting for everyone to bet… {secondsLeft !== null && `(${secondsLeft}s left)`}
                </p>
              )}
            </>
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
          {table.phase === "resolve" && !connection.gameWon && (
            <p className="rounded-md bg-black/50 px-3 py-1.5 text-sm font-medium text-amber-100 backdrop-blur">
              Round complete.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}