import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ThreeTableCanvas } from "./three-table-canvas";
import { playChip } from "@/lib/sound";
import { useSound } from "@/lib/use-sound";
import type { GameConnection } from "@/lib/ws";

const CHIP_COLORS: Record<number, { base: string; light: string; dark: string }> = {
  50: { base: "#1f8f4c", light: "#2eae5e", dark: "#166b3a" },
  100: { base: "#1d3f8f", light: "#2a52b0", dark: "#152f6b" },
  150: { base: "#b3223b", light: "#d42a46", dark: "#8a1a2e" },
  200: { base: "#2b2b2b", light: "#3a3a3a", dark: "#191919" },
};

function CasinoChip({
  value,
  selected,
  disabled,
  onClick,
}: {
  value: number;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const c = CHIP_COLORS[value]!;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`Bet ${value}`}
      title={`Bet ${value}`}
      className={
        "group relative flex h-12 w-12 items-center justify-center rounded-full transition-transform " +
        (disabled ? "cursor-not-allowed opacity-40 saturate-50" : "hover:-translate-y-1")
      }
    >
      <svg viewBox="0 0 60 60" className="h-12 w-12 drop-shadow-lg">
        <defs>
          <radialGradient id={`chipgrad-${value}`} cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor={c.light} />
            <stop offset="1" stopColor={c.dark} />
          </radialGradient>
        </defs>
        {selected && <circle cx="30" cy="30" r="28" fill="#f5d76e" />}
        <circle cx="30" cy="30" r="26" fill={`url(#chipgrad-${value})`} />
        <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
        <circle
          cx="30"
          cy="30"
          r="22.5"
          fill="none"
          stroke={c.base}
          strokeWidth="5"
          strokeDasharray="4 3.2"
        />
        <circle cx="30" cy="30" r="18.5" fill={c.base} />
        <circle cx="30" cy="30" r="18.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" />
        <circle cx="30" cy="30" r="12" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
        <circle cx="30" cy="30" r="7" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
        <text
          x="30"
          y="30.5"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="12"
          fontWeight="800"
          fill="#fff"
          style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
        >
          {value}
        </text>
      </svg>
    </button>
  );
}

export function Table({ connection, playerId }: { connection: GameConnection; playerId: string }) {
  const table = connection.table;
  const [betAmount, setBetAmount] = useState(100);
  const [now, setNow] = useState(() => Date.now());
  const { muted, toggle } = useSound(table, playerId);

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

  const amount = betAmount;
  const canBet = betting && !!me && me.bet === 0 && amount > 0;

  const chipOptions = [50, 100, 150, 200];

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
          <h1 className="rounded-lg bg-black/40 px-3 py-1.5 text-base font-bold text-amber-100 backdrop-blur sm:text-lg">
            Blackjack Party
          </h1>
          <div className="flex items-center gap-2">
            <div className="hidden rounded-lg bg-black/40 px-3 py-1.5 text-sm text-amber-100/90 backdrop-blur sm:block">
              Room <span className="font-mono font-semibold">{connection.roomCode}</span> · Round {table.round}
            </div>
            {amHost && !connection.gameWon && (
              <button
                type="button"
                onClick={() => connection.send({ type: "addBot" })}
                disabled={connection.roster.length >= 6}
                className="pointer-events-auto flex h-8 items-center justify-center rounded-lg bg-black/40 px-2.5 text-sm text-amber-100/90 backdrop-blur transition-colors hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-40"
                title="Add a bot to play the dealer"
                aria-label="Add Bot"
              >
                Add Bot
              </button>
            )}
            <button
              type="button"
              onClick={toggle}
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg bg-black/40 text-amber-100/90 backdrop-blur transition-colors hover:bg-black/60"
              title={muted ? "Unmute sounds" : "Mute sounds"}
              aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            >
              {muted ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-4 right-4 hidden flex-col gap-1.5 text-right sm:flex">
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
                {p.isBot && <span className="ml-1.5 text-amber-200/60">[bot]</span>}
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
                  {connection.roster.find((p) => p.id === playerId)?.spectating
                    ? "You're spectating this table — you'll play on the next one."
                    : "Your bankroll fell below the minimum bet — you're spectating."}
                </p>
              )}
              {!amSpectating && me && me.bet === 0 && (
                <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-xl bg-black/50 p-3 backdrop-blur">
                  <div className="flex items-end gap-3">
                    {chipOptions.map((v) => (
                      <CasinoChip
                        key={v}
                        value={v}
                        selected={betAmount === v}
                        disabled={!canBet || v > me.bankroll}
                        onClick={() => {
                          playChip();
                          setBetAmount(v);
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button onClick={() => connection.send({ type: "placeBet", amount })} disabled={!canBet}>
                      Place Bet
                    </Button>
                    {secondsLeft !== null && (
                      <span className="w-16 text-right text-sm text-amber-100/80">
                        {secondsLeft}s
                      </span>
                    )}
                  </div>
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