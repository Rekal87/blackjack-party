import { useEffect, useRef, useState } from "react";
import type { TableState } from "@/server/table";
import { initSound, playDeal, playLose, playShuffle, playWin, setMuted } from "./sound";

export function useSound(table: TableState | null, myPlayerId: string | null) {
  const [muted, setMutedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("blackjack.muted") === "1";
    } catch {
      return false;
    }
  });

  const lastRound = useRef<number | null>(null);
  const lastResolvedHands = useRef<string | null>(null);

  useEffect(() => {
    initSound();
  }, []);

  useEffect(() => {
    if (!table) return;

    // deal / shuffle at the start of a fresh round's dealing
    if (table.phase === "acting" && lastRound.current !== table.round) {
      lastRound.current = table.round;
      playShuffle();
      playDeal();
    }

    // resolve sounds based on my own hand results
    if (table.phase === "resolve" && myPlayerId) {
      const me = table.players.find((p) => p.id === myPlayerId);
      if (me) {
        const signature = me.hands.map((h) => h.result ?? "pending").join(",");
        if (signature !== lastResolvedHands.current) {
          lastResolvedHands.current = signature;
          const won = me.hands.some((h) => h.result === "won");
          const anyResult = me.hands.some((h) => h.result !== undefined);
          if (anyResult && won) playWin();
          else if (anyResult) playLose();
        }
      }
    }
  }, [table, myPlayerId]);

  const toggle = () => {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
  };

  return { muted, toggle };
}