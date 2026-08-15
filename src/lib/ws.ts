import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@/shared/protocol";
import type { TableState } from "@/server/table";

export interface GameConnection {
  status: "connecting" | "open" | "closed";
  playerId: string | null;
  roomCode: string | null;
  roster: { id: string; name: string }[];
  tableStarted: boolean;
  table: TableState | null;
  error: string | null;
  send: (message: ClientMessage) => void;
}

export function useGameConnection(): GameConnection {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<GameConnection["status"]>("connecting");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roster, setRoster] = useState<{ id: string; name: string }[]>([]);
  const [tableStarted, setTableStarted] = useState(false);
  const [table, setTable] = useState<TableState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!disposed) {
        setStatus("open");
        setError(null);
      }
    };
    ws.onclose = () => {
      if (!disposed) setStatus("closed");
    };
    ws.onerror = () => {
      if (!disposed) setError("connection error");
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      switch (message.type) {
        case "roomJoined":
          setPlayerId(message.playerId);
          setRoomCode(message.room.code);
          setRoster(message.room.players);
          break;
        case "playerJoined":
          setRoster((r) => [...r, message.player]);
          break;
        case "playerLeft":
          setRoster((r) => r.filter((p) => p.id !== message.playerId));
          break;
        case "tableStarted":
          setTableStarted(true);
          break;
        case "tableState":
          setTable(message.state);
          break;
        case "error":
          setError(message.message);
          break;
      }
    };

    return () => {
      disposed = true;
      ws.close();
    };
  }, []);

  const send = useCallback((message: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  return { status, playerId, roomCode, roster, tableStarted, table, error, send };
}