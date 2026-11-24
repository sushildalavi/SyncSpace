/**
 * Repeatable load test for the collaboration path.
 *
 * It signs up a real user through the API, creates a workspace and documents, opens many authenticated
 * WebSocket clients spread across one or more API instances, and has writers apply Yjs edits.
 * It reports: connect time, ack latency (client -> persisted -> ack), propagation latency (writer's
 * edit -> visible in a reader, usually on another instance), throughput, and whether every client converged.
 *
 *   tsx src/main.ts --apis http://localhost:3201,http://localhost:3202 --origin http://localhost:3200 \
 *     --docs 2 --writers 5 --readers 20 --updates 100 --interval 50
 */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import WebSocket from "ws";
import * as Y from "yjs";
import { summarize } from "./stats.js";

const { values } = parseArgs({
  options: {
    apis: { type: "string", default: "http://localhost:3201" },
    origin: { type: "string", default: "http://localhost:3200" },
    docs: { type: "string", default: "2" },
    writers: { type: "string", default: "3" },
    readers: { type: "string", default: "10" },
    updates: { type: "string", default: "50" },
    interval: { type: "string", default: "40" },
    json: { type: "boolean", default: false }
  }
});
const apis = values.apis!.split(",");
const origin = values.origin!;
const docCount = Number(values.docs);
const writersPerDoc = Number(values.writers);
const readersPerDoc = Number(values.readers);
const updatesPerWriter = Number(values.updates);
const interval = Number(values.interval);
const perDoc = writersPerDoc + readersPerDoc;

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const fromB64 = (value: string) => new Uint8Array(Buffer.from(value, "base64"));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let ipCounter = 1;
const headersFor = (extra: Record<string, string> = {}) => ({
  "content-type": "application/json",
  origin,
  "x-forwarded-for": `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`,
  ...extra
});

async function call(api: string, path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const response = await fetch(`${api}${path}`, {
    method: init.method ?? "GET",
    headers: headersFor(init.cookie ? { cookie: init.cookie } : {}),
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${response.status} ${JSON.stringify(data)}`);
  return { data, response };
}

async function newSession(api: string, label: string): Promise<string> {
  const email = `${label}-${randomUUID().slice(0, 8)}@load.test`;
  const body = { email, password: "load-test-password-1", name: label };
  await call(api, "/api/auth/sign-up/email", { method: "POST", body });
  const { response } = await call(api, "/api/auth/sign-in/email", { method: "POST", body: { email, password: body.password } });
  return response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

type Client = { ws: WebSocket; doc: Y.Doc; role: "writer" | "reader"; documentId: string; pendingAcks: Map<string, number>; seen: Set<string> };

const ackLatencies: number[] = [];
const propagationLatencies: number[] = [];
const connectTimes: number[] = [];
let sent = 0;
let acked = 0;
let rejected = 0;
const sentAt = new Map<string, number>();

async function connect(api: string, cookie: string, documentId: string, role: Client["role"]): Promise<Client> {
  const started = performance.now();
  const client: Client = { ws: null as never, doc: new Y.Doc(), role, documentId, pendingAcks: new Map(), seen: new Set() };
  const ws = new WebSocket(`${api.replace("http", "ws")}/collaboration?documentId=${documentId}&clientId=${randomUUID()}`, { headers: { cookie, origin } });
  client.ws = ws;
  await new Promise<void>((resolve, reject) => {
    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "document.snapshot") {
        Y.applyUpdate(client.doc, fromB64(message.payload.snapshot), "remote");
        connectTimes.push(performance.now() - started);
        resolve();
      } else if (message.type === "document.ack") {
        const t0 = client.pendingAcks.get(message.payload.updateId);
        if (t0 !== undefined) {
          ackLatencies.push(performance.now() - t0);
          client.pendingAcks.delete(message.payload.updateId);
          acked += 1;
        }
      } else if (message.type === "document.rejected") {
        rejected += 1;
      } else if (message.type === "document.update") {
        const now = performance.now();
        Y.applyUpdate(client.doc, fromB64(message.payload.payload), "remote");
        for (const marker of client.doc.getText("body").toString().match(/\[w\d+:\d+\]/g) ?? []) {
          if (!client.seen.has(marker)) {
            client.seen.add(marker);
            const t0 = sentAt.get(marker);
            if (t0 !== undefined && role === "reader") propagationLatencies.push(now - t0);
          }
        }
      }
    });
    ws.once("error", reject);
    ws.once("close", (code) => reject(new Error(`socket closed during connect (${code})`)));
  });
  return client;
}

async function main() {
  const wallStart = performance.now();
  console.error(`Setting up ${docCount} document(s) across ${apis.length} API instance(s)…`);
  const cookie = await newSession(apis[0]!, "owner");
  const { data: workspace } = await call(apis[0]!, "/workspaces", { method: "POST", cookie, body: { name: "Load test" } });
  const workspaceId = (workspace as { id: string }).id;

  const docIds: string[] = [];
  for (let d = 0; d < docCount; d += 1) {
    const { data } = await call(apis[0]!, `/workspaces/${workspaceId}/documents`, { method: "POST", cookie, body: { title: `Load ${d}` } });
    docIds.push((data as { id: string }).id);
  }

  // One session opens every socket. Authorization is still checked per connection, and the cookie is valid on
  // every instance because sessions live in PostgreSQL.
  const allClients: Client[] = [];
  for (const documentId of docIds) {
    allClients.push(
      ...(await Promise.all(Array.from({ length: perDoc }, (_, index) => connect(apis[index % apis.length]!, cookie, documentId, index < writersPerDoc ? "writer" : "reader"))))
    );
  }
  const writers = allClients.filter((c) => c.role === "writer");
  console.error(`Connected ${allClients.length} clients. ${writers.length} writers x ${updatesPerWriter} updates…`);

  const writeStart = performance.now();
  await Promise.all(
    writers.map(async (client, writerIndex) => {
      const text = client.doc.getText("body");
      for (let n = 0; n < updatesPerWriter; n += 1) {
        const marker = `[w${writerIndex}:${n}]`;
        let update: Uint8Array = new Uint8Array();
        const capture = (u: Uint8Array, origin: unknown) => {
          if (origin !== "remote") update = u;
        };
        client.doc.on("update", capture);
        sentAt.set(marker, performance.now());
        text.insert(text.length, marker);
        client.doc.off("update", capture);
        const updateId = randomUUID();
        client.pendingAcks.set(updateId, performance.now());
        client.ws.send(JSON.stringify({ type: "document.update", payload: { documentId: client.documentId, updateId, payload: b64(update) } }));
        sent += 1;
        await sleep(interval * (0.5 + Math.random()));
      }
    })
  );
  const writeMs = performance.now() - writeStart;

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && acked + rejected < sent) await sleep(100);
  await sleep(1500);

  let diverged = 0;
  for (let d = 0; d < docIds.length; d += 1) {
    const group = allClients.slice(d * perDoc, (d + 1) * perDoc);
    const reference = group[0]!.doc.getText("body").toString();
    diverged += group.filter((client) => client.doc.getText("body").toString() !== reference).length;
  }
  const observed = new Set(allClients.flatMap((c) => c.doc.getText("body").toString().match(/\[w\d+:\d+\]/g) ?? [])).size;

  const result = {
    config: { apis: apis.length, documents: docCount, writersPerDoc, readersPerDoc, updatesPerWriter, intervalMs: interval, clients: allClients.length },
    connectMs: summarize(connectTimes),
    ackMs: summarize(ackLatencies),
    propagationMs: summarize(propagationLatencies),
    throughput: { updatesSent: sent, updatesAcked: acked, rejected, updatesPerSecond: Number((acked / (writeMs / 1000)).toFixed(1)), writeSeconds: Number((writeMs / 1000).toFixed(1)) },
    convergence: { divergedClients: diverged, markersExpected: writers.length * updatesPerWriter, markersObserved: observed },
    totalSeconds: Number(((performance.now() - wallStart) / 1000).toFixed(1))
  };
  allClients.forEach((client) => client.ws.close());
  console.log(values.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  if (diverged > 0 || acked < sent || rejected > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
