import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GameConnection } from "@/lib/ws";

export function Lobby({
  connection,
  onJoined,
}: {
  connection: GameConnection;
  onJoined: (playerId: string) => void;
}) {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const create = () => {
    if (!name.trim()) return;
    connection.send({ type: "createRoom", name: name.trim() });
  };

  const join = () => {
    if (!name.trim() || !joinCode.trim()) return;
    connection.send({ type: "join", code: joinCode.trim().toUpperCase(), name: name.trim() });
  };

  if (connection.playerId) {
    onJoined(connection.playerId);
    return null;
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-3xl">Blackjack Party</CardTitle>
          <CardDescription>Create a Room or join a friend's with the code.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              placeholder="Ace"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (joinCode.trim()) join();
                  else create();
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">Room code</Label>
            <Input
              id="code"
              placeholder="ABCD"
              maxLength={4}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && join()}
            />
          </div>
          <div className="flex gap-3">
            <Button onClick={join} disabled={!name.trim() || !joinCode.trim()} className="flex-1">
              Join Room
            </Button>
            <Button onClick={create} disabled={!name.trim()} className="flex-1">
              Create Room
            </Button>
          </div>
          {connection.error && <p className="text-sm text-destructive">{connection.error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}