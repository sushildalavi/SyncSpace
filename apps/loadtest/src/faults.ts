/**
 * Fault-injection run for the collaboration path.
 *
 * Writers and readers connect across two API instances and keep editing while the harness:
 *   1. pauses Redis (cross-instance fan-out stalls),
 *   2. restarts Redis (the event stream is wiped, so events are LOST, not merely delayed),
 *   3. kills one API instance with SIGKILL (its sockets drop without a close frame).
 *
 * Clients behave like the real editor: unacknowledged updates are kept and replayed (idempotent by updateId) after
 * reconnecting to a surviving instance. Afterwards it checks
 *   - durability:    every update the server acknowledged is in the persisted document,
 *   - delivery:      every update a writer produced was eventually acknowledged,
 *   - convergence:   every client ends with exactly the persisted document.
 *
 * Needs docker compose (for Redis) and `lsof`. Run through scripts/fault-injection.sh.
 */
import { exec as execCb, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import WebSocket from "ws";
import * as Y from "yjs";

const { values } = parseArgs({
  options: {
    apis: { type: "string", default: "http://localhost:3201,http://localhost:3202" },
    origin: { type: "string", default: "http://localhost:3200" },
    docs: { type: "string", default: "2" },
    writers: { type: "string", default: "3" },
    readers: { type: "string", default: "8" },
    interval: { type: "string", default: "100" },
    "kill-port": { type: "string", default: "3202" },
    "no-sync-check": { type: "boolean", default: false },
    json: { type: "boolean", default: false }
  }
});
const apis = values.apis!.split(",");
const origin = values.origin!;
const docCount = Number(values.docs);
const writersPerDoc = Number(values.writers);
const readersPerDoc = Number(values.readers);
const interval = Number(values.interval);
const killPort = values["kill-port"]!;
const syncChecks = !values["no-sync-check"];

const exec = (command: string) => new Promise<void>((resolve) => execCb(command, () => resolve()));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const fromB64 = (value: string) => new Uint8Array(Buffer.from(value, "base64"));
const log = (message: string) => console.error(`[${((performance.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${message}`);
const t0 = performance.now();

let ip = 1;
async function call(api: string, path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const response = await fetch(`${api}${path}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": `10.8.0.${(ip++ % 250) + 1}`, ...(init.cookie ? { cookie: init.cookie } : {}) },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${JSON.stringify(data)}`);
  return { data, response };
}

const acked = new Set<string>(); // markers the server acknowledged
const produced = new Set<string>(); // markers writers created
let ackGapMax = 0;
let lastAckAt = performance.now();
const ackLatencies: number[] = [];

class Client {
  doc = new Y.Doc();
  ws: WebSocket | null = null;
  synced = false;
  contiguous = 0;
  ahead = new Set<number>();
  behind = 0;
  reconnects = 0;
  resyncs = 0;
  pending = new Map<string, { payload: string; markers: string[]; at: number }>();
  stopped = false;
  private preferred: number;

  constructor(
    readonly documentId: string,
    readonly role: "writer" | "reader",
    readonly index: number,
    private readonly cookie: string
  ) {
    this.preferred = index % apis.length;
  }

  async start(): Promise<void> {
    await this.connect(true);
  }

  private async connect(first = false): Promise<void> {
    for (let attempt = 0; !this.stopped; attempt += 1) {
      const api = apis[(this.preferred + attempt) % apis.length]!;
      try {
        await this.open(api);
        if (!first) this.reconnects += 1;
        return;
      } catch {
        await sleep(Math.min(2000, 150 * 2 ** Math.min(attempt, 4)));
      }
    }
  }

  private open(api: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${api.replace("http", "ws")}/collaboration?documentId=${this.documentId}&clientId=${randomUUID()}`, { headers: { cookie: this.cookie, origin } });
      let opened = false;
      ws.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        const payload = message.payload ?? {};
        switch (message.type) {
          case "document.snapshot":
            Y.applyUpdate(this.doc, fromB64(payload.snapshot), "remote");
            this.contiguous = Math.max(this.contiguous, payload.version);
            for (const v of this.ahead) if (v <= this.contiguous) this.ahead.delete(v);
            while (this.ahead.delete(this.contiguous + 1)) this.contiguous += 1;
            if (!this.synced) {
              this.synced = true;
              this.ws = ws;
              opened = true;
              this.replayPending();
              resolve();
            }
            break;
          case "document.update":
            Y.applyUpdate(this.doc, fromB64(payload.payload), "remote");
            this.note(payload.version);
            break;
          case "document.ack": {
            this.note(payload.version);
            const entry = this.pending.get(payload.updateId);
            if (entry) {
              this.pending.delete(payload.updateId);
              entry.markers.forEach((marker) => acked.add(marker));
              ackLatencies.push(performance.now() - entry.at);
              const now = performance.now();
              ackGapMax = Math.max(ackGapMax, now - lastAckAt);
              lastAckAt = now;
            }
            break;
          }
          case "sync.check":
            if (!syncChecks) break;
            // Two consecutive checks behind (so in-flight events aren't mistaken for loss) -> ask for the state.
            this.behind = payload.version > this.contiguous ? this.behind + 1 : 0;
            if (this.behind >= 2) {
              this.behind = 0;
              this.resyncs += 1;
              ws.send(JSON.stringify({ type: "sync.request", payload: {} }));
            }
            break;
        }
      });
      ws.on("close", () => {
        if (this.ws === ws) {
          this.ws = null;
          this.synced = false;
          if (!this.stopped) setTimeout(() => void this.connect(), 500 + Math.random() * 1000);
        }
        if (!opened) reject(new Error("closed before sync"));
      });
      ws.on("error", () => undefined);
    });
  }

  /** Same strategy as the web client: the whole unacked backlog goes up as one merged update. */
  private replayPending() {
    if (this.pending.size > 1) {
      const entries = [...this.pending.values()];
      const merged = { payload: b64(Y.mergeUpdates(entries.map((e) => fromB64(e.payload)))), markers: entries.flatMap((e) => e.markers), at: entries[0]!.at };
      this.pending.clear();
      this.pending.set(randomUUID(), merged);
    }
    for (const [updateId, entry] of this.pending) this.send(updateId, entry.payload);
  }

  private note(version: number) {
    if (!Number.isFinite(version) || version <= this.contiguous) return;
    this.ahead.add(version);
    while (this.ahead.delete(this.contiguous + 1)) this.contiguous += 1;
  }

  private send(updateId: string, payload: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "document.update", payload: { documentId: this.documentId, updateId, payload } }));
    }
  }

  write(marker: string) {
    const text = this.doc.getText("body");
    let update: Uint8Array = new Uint8Array();
    const capture = (u: Uint8Array, origin: unknown) => {
      if (origin !== "remote") update = u;
    };
    this.doc.on("update", capture);
    text.insert(text.length, marker);
    this.doc.off("update", capture);
    const updateId = randomUUID();
    produced.add(marker);
    const entry = { payload: b64(update), markers: [marker], at: performance.now() };
    this.pending.set(updateId, entry);
    if (this.synced) this.send(updateId, entry.payload);
  }

  text(): string {
    return this.doc.getText("body").toString();
  }

  close() {
    this.stopped = true;
    this.ws?.close();
  }
}

const sh = (command: string) => {
  try {
    execSync(command, { stdio: "ignore" });
  } catch {
    /* best effort */
  }
};

async function main() {
  log("Setting up…");
  const signUp = { email: `faults-${randomUUID().slice(0, 8)}@load.test`, password: "fault-test-password-1", name: "Faults" };
  await call(apis[0]!, "/api/auth/sign-up/email", { method: "POST", body: signUp });
  const { response } = await call(apis[0]!, "/api/auth/sign-in/email", { method: "POST", body: { email: signUp.email, password: signUp.password } });
  const cookie = response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const workspace = (await call(apis[0]!, "/workspaces", { method: "POST", cookie, body: { name: "Faults" } })).data as { id: string };
  const docIds: string[] = [];
  for (let d = 0; d < docCount; d += 1) {
    docIds.push(((await call(apis[0]!, `/workspaces/${workspace.id}/documents`, { method: "POST", cookie, body: { title: `Doc ${d}` } })).data as { id: string }).id);
  }

  const clients: Client[] = [];
  for (const documentId of docIds) {
    for (let i = 0; i < writersPerDoc + readersPerDoc; i += 1) {
      clients.push(new Client(documentId, i < writersPerDoc ? "writer" : "reader", clients.length, cookie));
    }
  }
  await Promise.all(clients.map((c) => c.start()));
  const writers = clients.filter((c) => c.role === "writer");
  log(`${clients.length} clients connected (${writers.length} writers). Sync checks ${syncChecks ? "ON" : "OFF"}.`);

  // Authoritative state: what a brand-new connection to a surviving instance reads from PostgreSQL.
  const survivor = apis.find((api) => !api.endsWith(`:${killPort}`))!;
  const persistedFor = (documentId: string) =>
    new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`${survivor.replace("http", "ws")}/collaboration?documentId=${documentId}&clientId=${randomUUID()}`, { headers: { cookie, origin } });
      ws.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === "document.snapshot") {
          const d = new Y.Doc();
          Y.applyUpdate(d, fromB64(message.payload.snapshot));
          ws.close();
          resolve(d.getText("body").toString());
        }
      });
      ws.on("error", reject);
    });

  let persisted = new Map<string, string>();
  /** Waits until every update is acknowledged and every client holds exactly the persisted document. */
  async function settle(maxMs: number) {
    const began = performance.now();
    while (performance.now() - began < maxMs) {
      persisted = new Map(await Promise.all(docIds.map(async (id) => [id, await persistedFor(id)] as const)));
      const stale = clients.filter((c) => c.text() !== persisted.get(c.documentId)).length;
      if (clients.every((c) => c.pending.size === 0) && stale === 0) return { settled: true, seconds: Number(((performance.now() - began) / 1000).toFixed(1)), stale: 0 };
      await sleep(1000);
    }
    persisted = new Map(await Promise.all(docIds.map(async (id) => [id, await persistedFor(id)] as const)));
    return { settled: false, seconds: null as number | null, stale: clients.filter((c) => c.text() !== persisted.get(c.documentId)).length };
  }

  const pidOnPort = (port: string) => `lsof -ti tcp:${port} -sTCP:LISTEN`;
  const flushLoop = `docker compose exec -T redis sh -c 'for i in $(seq 1 25); do redis-cli FLUSHALL >/dev/null; sleep 0.2; done'`;

  let writing = true;
  const startWriters = () =>
    writers.map(async (client, w) => {
      for (let n = nextMarker.get(w) ?? 0; writing; n += 1) {
        nextMarker.set(w, n + 1);
        client.write(`[w${w}:${n}]`);
        await sleep(interval * (0.6 + Math.random() * 0.8));
      }
    });
  const nextMarker = new Map<number, number>();

  /* ---------- Phase A: Redis pause, then a frozen instance whose events are wiped ---------- */
  const faultsApplied: string[] = [];
  const at = async (ms: number, label: string, action: () => void | Promise<void>, since: number) => {
    const wait = ms - (performance.now() - since);
    if (wait > 0) await sleep(wait);
    log(label);
    faultsApplied.push(label);
    await action();
  };
  const phaseA = performance.now();
  let loops = startWriters();
  await at(5000, "PAUSE redis (4 s): fan-out stalls", () => sh("docker compose pause redis"), phaseA);
  await at(9000, "UNPAUSE redis", () => sh("docker compose unpause redis"), phaseA);
  await at(12000, `FREEZE instance :${killPort} (SIGSTOP, like a long GC/VM stall)`, () => sh(`${pidOnPort(killPort)} | xargs kill -STOP`), phaseA);
  await at(12500, "FLUSHALL on Redis for 5 s: events published during the freeze are destroyed", () => void exec(flushLoop), phaseA);
  await at(18500, `RESUME instance :${killPort} (SIGCONT). Its sockets are still open but it missed events.`, () => sh(`${pidOnPort(killPort)} | xargs kill -CONT`), phaseA);
  await at(30000, "stop writers", () => undefined, phaseA);
  writing = false;
  await Promise.all(loops);

  log(`Checking convergence BEFORE any reconnect can hide a missed event (produced ${produced.size}, acked ${acked.size})…`);
  const beforeKill = await settle(35_000);
  log(beforeKill.settled ? `converged in ${beforeKill.seconds}s` : `NOT converged: ${beforeKill.stale} client(s) are behind the persisted document`);

  /* ---------- Phase B: more edits, then kill -9 an instance ---------- */
  writing = true;
  const phaseB = performance.now();
  loops = startWriters();
  await at(3000, `KILL -9 instance :${killPort}: sockets drop without a close frame`, () => sh(`${pidOnPort(killPort)} | xargs kill -9`), phaseB);
  await at(10000, "stop writers", () => undefined, phaseB);
  writing = false;
  await Promise.all(loops);
  log(`Writers stopped. Waiting for the final settle…`);
  const finalSettle = await settle(45_000);
  const settledAt = finalSettle.settled ? finalSettle.seconds : null;

  const markersIn = (text: string) => new Set(text.match(/\[w\d+:\d+\]/g) ?? []);
  const persistedMarkers = new Set(docIds.flatMap((id) => [...markersIn(persisted.get(id) ?? "")]));
  const ackedButMissing = [...acked].filter((marker) => !persistedMarkers.has(marker));
  const neverAcked = [...produced].filter((marker) => !acked.has(marker));
  const stale = clients.filter((c) => c.text() !== persisted.get(c.documentId));
  const sorted = [...ackLatencies].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? NaN;

  const result = {
    config: { clients: clients.length, writers: writers.length, instances: apis.length, syncChecks },
    faults: faultsApplied,
    beforeAnyReconnect: { converged: beforeKill.settled, secondsToConverge: beforeKill.seconds, staleClients: beforeKill.stale },
    delivery: { produced: produced.size, acknowledged: acked.size, neverAcknowledged: neverAcked.length, stillPending: clients.reduce((n, c) => n + c.pending.size, 0) },
    durability: { ackedButMissingFromPersistedDoc: ackedButMissing.length },
    finalConvergence: { settled: settledAt !== null, secondsToSettle: settledAt, staleClients: stale.length },
    recovery: { reconnects: clients.reduce((n, c) => n + c.reconnects, 0), resyncRequests: clients.reduce((n, c) => n + c.resyncs, 0) },
    ackLatencyMs: { p50: Math.round(pct(50)), p95: Math.round(pct(95)), p99: Math.round(pct(99)), longestGapBetweenAcksMs: Math.round(ackGapMax) }
  };
  clients.forEach((c) => c.close());
  console.log(values.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  const ok = ackedButMissing.length === 0 && neverAcked.length === 0 && settledAt !== null && stale.length === 0 && beforeKill.settled;
  log(ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
