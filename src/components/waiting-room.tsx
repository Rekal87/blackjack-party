import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GameConnection } from "@/lib/ws";

export function WaitingRoom({
  connection,
  playerId,
  onStart,
}: {
  connection: GameConnection;
  playerId: string;
  onStart: () => void;
}) {
  const isHost = connection.hostId === playerId;

  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-3xl">Blackjack Party</CardTitle>
          <CardDescription>Waiting for friends to join…</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="rounded-lg border bg-muted p-4 text-center">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Room code</p>
            <p className="mt-1 font-mono text-4xl font-bold tracking-widest">{connection.roomCode}</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Players</p>
            <ul className="flex flex-col gap-1">
              {connection.roster.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={
                      p.id === playerId
                        ? "font-semibold text-primary"
                        : p.id === connection.hostId
                          ? "font-medium"
                          : p.connected
                            ? ""
                            : "text-muted-foreground/60 line-through"
                    }
                  >
                    {p.name}
                  </span>
                  {!p.connected && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">offline</span>
                  )}
                  {p.id === connection.hostId && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Host</span>
                  )}
                  {p.id === playerId && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">You</span>
                  )}
                  {p.isBot && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Bot</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {isHost && (
            <div className="flex flex-col gap-2">
              <Button onClick={onStart} className="w-full">
                Start Table
              </Button>
              <Button
                variant="secondary"
                onClick={() => connection.send({ type: "addBot" })}
                className="w-full"
                disabled={connection.roster.length >= 6}
              >
                Add Bot
              </Button>
            </div>
          )}
          {!isHost && <p className="text-center text-sm text-muted-foreground">The Host will start the table.</p>}
          {connection.error && <p className="text-sm text-destructive">{connection.error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}