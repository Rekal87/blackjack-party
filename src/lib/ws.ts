import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@/shared/protocol";
import type { TableState } from "@/server/table";

export interface GameConnection {
  status: "connecting" | "open" | "closed";
  playerId: string | null;
  hostId: string | null;
  roomCode: string | null;
  roster: { id: string; name: string; spectating: boolean; connected: boolean; isBot?: boolean }[];
  tableStarted: boolean;
  table: TableState | null;
  gameWon: { winnerId: string; winnerName: string } | null;
  error: string | null;
  send: (message: ClientMessage) => void;
}

const STORAGE_KEY = "blackjack.identity";

interface StoredIdentity {
  code: string;
  playerId: string;
}

function loadIdentity(): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredIdentity;
    if (typeof parsed.code !== "string" || typeof parsed.playerId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveIdentity(identity: StoredIdentity): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // ignore storage failures
  }
}

function clearIdentity(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

export function useGameConnection(): GameConnection {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const [status, setStatus] = useState<GameConnection["status"]>("connecting");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roster, setRoster] = useState<GameConnection["roster"]>([]);
  const [tableStarted, setTableStarted] = useState(false);
  const [table, setTable] = useState<TableState | null>(null);
  const [gameWon, setGameWon] = useState<GameConnection["gameWon"]>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let attempts = 0;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        attempts = 0;
        setStatus("open");
        setError(null);
        const identity = loadIdentity();
        if (identity) {
          ws.send(JSON.stringify({ type: "reconnect", code: identity.code, playerId: identity.playerId }));
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setStatus("closed");
        const delay = Math.min(1000 * 2 ** attempts, 10000);
        attempts++;
        reconnectTimer.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        if (!disposed) setError("connection error");
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as ServerMessage;
        switch (message.type) {
          case "roomJoined":
            setPlayerId(message.playerId);
            setHostId(message.room.hostId);
            setRoomCode(message.room.code);
            setRoster(message.room.players);
            if (message.room.started) setTableStarted(true);
            saveIdentity({ code: message.room.code, playerId: message.playerId });
            break;
          case "playerJoined":
            setRoster((r) => [...r, message.player]);
            break;
          case "playerLeft":
            setRoster((r) => r.filter((p) => p.id !== message.playerId));
            break;
          case "playerSpectating":
            setRoster((r) => r.map((p) => (p.id === message.playerId ? { ...p, spectating: true } : p)));
            break;
          case "playerDisconnected":
            setRoster((r) => r.map((p) => (p.id === message.playerId ? { ...p, connected: false } : p)));
            break;
          case "playerReconnected":
            setRoster((r) => r.map((p) => (p.id === message.playerId ? { ...p, connected: true } : p)));
            break;
          case "hostChanged":
            setHostId(message.hostId);
            break;
          case "gameWon":
            setGameWon({ winnerId: message.winnerId, winnerName: message.winnerName });
            break;
          case "tableStarted":
            setTableStarted(true);
            setGameWon(null);
            break;
          case "tableState":
            setTable(message.state);
            break;
          case "error":
            setError(message.message);
            break;
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((message: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  return { status, playerId, hostId, roomCode, roster, tableStarted, table, gameWon, error, send };
}

export function leaveRoom(): void {
  clearIdentity();
}