/**
 * Fault-injection run for the collaboration path.
 *
 * Writers and readers connect across two API instances and keep editing while the harness breaks things underneath
 * them. Scenarios (--scenario):
 *   redis     Redis pauses; one instance freezes while the event stream is wiped; that instance is then kill -9'd.
 *   database  PostgreSQL stalls, then crashes and restarts, while some clients reconnect.
 *   outage    PostgreSQL, then Redis, is down for --outage seconds.
 *
 * Clients behave like the real editor: unacknowledged updates are kept and replayed (idempotent by updateId) after
 * reconnecting to a surviving instance. Afterwards it checks
 *   - durability:    every update the server acknowledged is in the persisted document,
 *   - delivery:      every update a writer produced was eventually acknowledged,
 *   - convergence:   every client ends with exactly the persisted document.
 *
 * Needs docker compose (for Redis) and `lsof`. Run through scripts/faultInjection.sh.
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
    scenario: { type: "string", default: "redis" },
    outage: { type: "string", default: "90" },
    "redis-container": { type: "string", default: "syncspace-faults-redis" },
    "pg-container": { type: "string", default: "syncspace-faults-pg" },
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
const scenario = values.scenario!;
const outageSeconds = Number(values.outage);
const redisBox = values["redis-container"]!;
const pgBox = values["pg-container"]!;
/** Close codes after which the real editor gives up instead of reconnecting. An outage must never produce one. */
const TERMINAL_CODES = new Set([4401, 4403, 4404, 4410, 4411]);
const terminated: number[] = [];
let serverErrors = 0;

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
            }
            break;
          }
          case "error":
            serverErrors += 1;
            break;
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
      ws.on("close", (code) => {
        if (TERMINAL_CODES.has(code)) {
          terminated.push(code);
          this.stopped = true;
        }
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

  /** Drops the socket as a flaky network would, so the client has to connect again. */
  flap() {
    this.ws?.terminate();
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
      const timer = setTimeout(() => ws.terminate(), 10_000);
      ws.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === "document.snapshot") {
          const d = new Y.Doc();
          Y.applyUpdate(d, fromB64(message.payload.snapshot));
          clearTimeout(timer);
          resolve(d.getText("body").toString());
          ws.close();
        }
      });
      ws.on("error", () => undefined);
      ws.on("close", (code) => {
        clearTimeout(timer);
        reject(new Error(`closed ${code} before the document arrived`));
      });
    });

  let persisted = new Map<string, string>();
  const readPersisted = async () => {
    persisted = new Map(await Promise.all(docIds.map(async (id) => [id, await persistedFor(id)] as const)));
  };
  /** Waits until every update is acknowledged and every client holds exactly the persisted document. */
  async function settle(maxMs: number) {
    const began = performance.now();
    while (performance.now() - began < maxMs) {
      try {
        await readPersisted();
        const stale = clients.filter((c) => c.text() !== persisted.get(c.documentId)).length;
        if (clients.every((c) => c.pending.size === 0) && stale === 0) return { settled: true, seconds: Number(((performance.now() - began) / 1000).toFixed(1)), stale: 0 };
      } catch (error) {
        log(`can't read the document yet: ${String(error)}`);
      }
      await sleep(1000);
    }
    await readPersisted().catch(() => undefined);
    return { settled: false, seconds: null as number | null, stale: clients.filter((c) => c.text() !== persisted.get(c.documentId)).length };
  }

  const pidOnPort = (port: string) => `lsof -ti tcp:${port} -sTCP:LISTEN`;
  const flushLoop = `docker exec ${redisBox} sh -c 'for i in $(seq 1 25); do redis-cli FLUSHALL >/dev/null; sleep 0.2; done'`;

  let writing = true;
  const nextMarker = new Map<number, number>();
  const startWriters = () => {
    writing = true;
    return writers.map(async (client, w) => {
      for (let n = nextMarker.get(w) ?? 0; writing; n += 1) {
        nextMarker.set(w, n + 1);
        client.write(`[w${w}:${n}]`);
        await sleep(interval * (0.6 + Math.random() * 0.8));
      }
    });
  };
  const stopWriters = async (loops: Promise<void>[]) => {
    writing = false;
    await Promise.all(loops);
  };

  const faultsApplied: string[] = [];
  const at = async (ms: number, label: string, action: () => void | Promise<void>, since: number) => {
    const wait = ms - (performance.now() - since);
    if (wait > 0) await sleep(wait);
    log(label);
    faultsApplied.push(label);
    await action();
  };
  /** A few readers and one writer per document lose their connection and must come back. */
  const flapSome = () => clients.filter((c) => c.index % 4 === 0).forEach((c) => c.flap());

  const checkpoints: Array<{ after: string; converged: boolean; seconds: number | null; staleClients: number }> = [];
  const checkpoint = async (after: string, maxMs: number) => {
    log(`Checking convergence after ${after} (produced ${produced.size}, acked ${acked.size})…`);
    const result = await settle(maxMs);
    checkpoints.push({ after, converged: result.settled, seconds: result.seconds, staleClients: result.stale });
    log(result.settled ? `converged in ${result.seconds}s` : `NOT converged: ${result.stale} client(s) behind, ${clients.reduce((n, c) => n + c.pending.size, 0)} update(s) unacknowledged`);
  };

  if (scenario === "redis") {
    const began = performance.now();
    const loops = startWriters();
    await at(5000, "PAUSE redis (4 s): fan-out stalls", () => sh(`docker pause ${redisBox}`), began);
    await at(9000, "UNPAUSE redis", () => sh(`docker unpause ${redisBox}`), began);
    await at(12000, `FREEZE instance :${killPort} (SIGSTOP, like a long GC/VM stall)`, () => sh(`${pidOnPort(killPort)} | xargs kill -STOP`), began);
    await at(12500, "FLUSHALL on Redis for 5 s: events published during the freeze are destroyed", () => void exec(flushLoop), began);
    await at(18500, `RESUME instance :${killPort} (SIGCONT). Its sockets are still open but it missed events.`, () => sh(`${pidOnPort(killPort)} | xargs kill -CONT`), began);
    await at(30000, "stop writers", () => undefined, began);
    await stopWriters(loops);
    // checked BEFORE any reconnect can hide a missed event
    await checkpoint("the frozen instance", 35_000);
    const second = performance.now();
    const more = startWriters();
    await at(3000, `KILL -9 instance :${killPort}: sockets drop without a close frame`, () => sh(`${pidOnPort(killPort)} | xargs kill -9`), second);
    await at(10000, "stop writers", () => undefined, second);
    await stopWriters(more);
    await checkpoint("the crash", 45_000);
  } else if (scenario === "database") {
    const began = performance.now();
    const loops = startWriters();
    await at(5000, "PAUSE postgres (6 s): writes hang", () => sh(`docker pause ${pgBox}`), began);
    await at(8000, "drop some connections while postgres is stalled", flapSome, began);
    await at(11000, "UNPAUSE postgres", () => sh(`docker unpause ${pgBox}`), began);
    await at(18000, "KILL postgres (crash): every database connection is severed", () => sh(`docker kill ${pgBox}`), began);
    await at(20000, "drop some connections while postgres is down", flapSome, began);
    await at(27000, "START postgres", () => sh(`docker start ${pgBox}`), began);
    await at(40000, "stop writers", () => undefined, began);
    await stopWriters(loops);
    await checkpoint("the database faults", 60_000);
  } else if (scenario === "outage") {
    for (const [name, box] of [["postgres", pgBox], ["redis", redisBox]] as const) {
      const began = performance.now();
      const loops = startWriters();
      await at(3000, `STOP ${name} for ${outageSeconds} s`, () => sh(`docker stop -t 1 ${box}`), began);
      await at(3000 + (outageSeconds * 1000) / 2, `drop some connections halfway through the ${name} outage`, flapSome, began);
      await at(3000 + outageSeconds * 1000, `START ${name}`, () => sh(`docker start ${box}`), began);
      await at(13000 + outageSeconds * 1000, "stop writers", () => undefined, began);
      await stopWriters(loops);
      await checkpoint(`the ${name} outage`, 90_000);
    }
  } else {
    throw new Error(`unknown scenario "${scenario}"`);
  }

  const expectedAlive = scenario === "redis" ? apis.filter((api) => api === survivor) : apis;
  const alive = await Promise.all(expectedAlive.map((api) => fetch(`${api}/health`).then(async (r) => ((await r.json()) as { ok: boolean }).ok, () => false)));

  const markersIn = (text: string) => new Set(text.match(/\[w\d+:\d+\]/g) ?? []);
  const persistedMarkers = new Set(docIds.flatMap((id) => [...markersIn(persisted.get(id) ?? "")]));
  const ackedButMissing = [...acked].filter((marker) => !persistedMarkers.has(marker));
  const neverAcked = [...produced].filter((marker) => !acked.has(marker));
  const sorted = [...ackLatencies].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? NaN;

  const result = {
    config: { scenario, clients: clients.length, writers: writers.length, instances: apis.length, syncChecks, ...(scenario === "outage" ? { outageSeconds } : {}) },
    faults: faultsApplied,
    checkpoints,
    delivery: { produced: produced.size, acknowledged: acked.size, neverAcknowledged: neverAcked.length, stillPending: clients.reduce((n, c) => n + c.pending.size, 0) },
    durability: { ackedButMissingFromPersistedDoc: ackedButMissing.length },
    servers: { expectedAlive: expectedAlive.length, healthy: alive.filter(Boolean).length },
    clientsThatGaveUp: terminated,
    recovery: { reconnects: clients.reduce((n, c) => n + c.reconnects, 0), resyncRequests: clients.reduce((n, c) => n + c.resyncs, 0), serverErrorMessages: serverErrors },
    ackLatencyMs: { p50: Math.round(pct(50)), p95: Math.round(pct(95)), p99: Math.round(pct(99)) }
  };
  clients.forEach((c) => c.close());
  console.log(values.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  const ok =
    ackedButMissing.length === 0 &&
    neverAcked.length === 0 &&
    terminated.length === 0 &&
    alive.every(Boolean) &&
    checkpoints.every((item) => item.converged);
  log(ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
