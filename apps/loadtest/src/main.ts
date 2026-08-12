import WebSocket from "ws";

type LoadTestOptions = {
  url: string;
  documents: string[];
  connectionsPerDocument: number;
  updatesPerClient: number;
};

export async function runLoadTest(options: LoadTestOptions): Promise<void> {
  const sockets: WebSocket[] = [];
  for (const documentId of options.documents) {
    for (let index = 0; index < options.connectionsPerDocument; index += 1) {
      const socket = new WebSocket(`${options.url}?documentId=${encodeURIComponent(documentId)}&token=loadtest`);
      sockets.push(socket);
      await waitForOpen(socket);
      for (let updateIndex = 0; updateIndex < options.updatesPerClient; updateIndex += 1) {
        socket.send(
          JSON.stringify({
            type: "presence.update",
            payload: {
              eventId: crypto.randomUUID(),
              documentId,
              workspaceId: "loadtest",
              userId: `client-${index}`,
              userName: `Client ${index}`,
              color: "#22c55e",
              status: "active",
              expiresAt: new Date(Date.now() + 30_000).toISOString()
            }
          })
        );
      }
    }
  }

  for (const socket of sockets) {
    socket.close();
  }
}

async function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", (error) => reject(error));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runLoadTest({
    url: process.env.SYNCSPACE_LOADTEST_URL ?? "ws://localhost:3001/collaboration",
    documents: ["loadtest-document"],
    connectionsPerDocument: 1,
    updatesPerClient: 1
  });
}
