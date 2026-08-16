import { useGameConnection } from "@/lib/ws";
import { Lobby } from "@/components/lobby";
import { WaitingRoom } from "@/components/waiting-room";
import { Table } from "@/components/table";
import "./index.css";

export function App() {
  const connection = useGameConnection();
  const playerId = connection.playerId;

  if (connection.status === "connecting" || connection.status === "closed") {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        {connection.status === "closed" ? "Connection lost — reconnecting…" : "Connecting…"}
      </div>
    );
  }

  if (!playerId) {
    return <Lobby connection={connection} onJoined={() => {}} />;
  }

  if (!connection.tableStarted) {
    return (
      <WaitingRoom
        connection={connection}
        playerId={playerId}
        onStart={() => connection.send({ type: "startTable" })}
      />
    );
  }

  return <Table connection={connection} playerId={playerId} />;
}

export default App;