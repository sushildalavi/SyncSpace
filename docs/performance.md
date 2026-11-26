# Performance and failure testing

## Speed

**Reproduce:** `docker compose up -d postgres redis && scripts/bench.sh --docs 8 --writers 5 --readers 30 --updates 100 --interval 60`

`scripts/bench.sh` creates a fresh database, starts **two API instances** (ports 3201/3202) sharing one PostgreSQL and
one Redis, then `apps/loadtest` signs up a real user and opens authenticated WebSocket clients alternately on both
instances. Writers apply Yjs edits and send incremental updates. Readers are on both instances, so most deliveries
cross instances via the Redis stream.

Measured per run: **connect** (socket open → state received), **ack** (update sent → persisted and acknowledged),
**propagation** (edit made by a writer → visible in a reader's document), throughput, and **convergence** (every client of
a document must hold identical text). The run exits non-zero on any divergence, unacked update or rejection.

Add `--json` to get one line of machine-readable output. The script drops and recreates a `syncspace_bench` database in
the Compose PostgreSQL and uses ports 3201 and 3202.

These are single-machine numbers with the API, load generator, PostgreSQL 16 and Redis 7 (both in Docker) on the same
laptop. Use them for relative comparison and regression detection, not capacity planning.

### Recorded results (historical)

Measured on 2026-11-25 at commit `4d1572e` on an Apple M3 laptop with Node 26. The raw output was not kept. Median of
three runs, with the lowest and highest run in brackets. Times are in milliseconds.

| Run | Clients | Ack p50 | Ack p95 | Propagation p50 | Propagation p95 | Acked | Diverged clients |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4 docs × (5 writers + 20 readers), 40 ms interval | 100 | 4.7 (4.2–5.0) | 11 (10–82) | 5.5 (5.1–5.9) | 12 (12–91) | 6,000 / 6,000 | 0 |
| 8 docs × (5 writers + 30 readers), 60 ms interval | 280 | 17.5 (17.4–20.4) | 80 (75–98) | 19.7 (19.5–22.6) | 85 (78–100) | 12,000 / 12,000 | 0 |

Each run sends 2,000 or 4,000 updates. The 280-client runs handled about 540 updates per second. The machine was not idle
(load average near 10), and single p95 values varied widely.

Both configurations were run three times each again later the same day, with Node 22, while unrelated builds and tests
were running on the machine. Every update was acknowledged and no client diverged, but latency was far higher:
median acknowledgement 11–16 ms at 100 clients and 37–82 ms at 280, with p95 as high as 552 ms. Latency in this setup
depends heavily on what else the host is doing.

An earlier before-and-after comparison around the addition of single-document sharing (commits `d742287` and `4d1572e`)
showed median acknowledgement 1–2 ms slower afterwards. Each save now makes two more queries, to check workspace
membership and direct shares. That is the likely cause, but it was not profiled, and combining them has not been tried.

### What the tests showed about limits

- An early run at a 20 ms write interval offered 33–100 messages/second per writer. The server's per-connection limit
  (40 msg/s, close code `4429`) correctly disconnected those writers, and the run failed its own acked/convergence checks.
  The real editor batches to ~50 ms (≤ 20 msg/s), so this is the limiter working. It does mean the load test must stay
  under the limit to measure the data path.
- Latency grows with load: in the recorded runs, median acknowledgement rose from about 5 ms with 100 clients to about
  18 ms with 280. Each update is one PostgreSQL transaction (row-locked version bump and insert) followed by a stream
  append.

Long soak runs and runs across several machines have not been done.

## Failure testing

**Reproduce** (needs Docker and `lsof`; it starts its own throwaway PostgreSQL and Redis, so development data is not
touched). It kills whatever is listening on ports 3201 and 3202 when it exits, so keep those ports free:

```bash
scripts/faultInjection.sh --scenario redis               # about 75 s
scripts/faultInjection.sh --scenario database            # about 45 s
scripts/faultInjection.sh --scenario outage --outage 90  # about 4 min
```

Add `--no-sync-check` to the `redis` scenario to disable the resync mechanism and see what it prevents.

Two API instances share one PostgreSQL and one Redis. 22 clients (6 writers, 16 readers, 2 documents) are spread across
both and keep editing while `apps/loadtest/src/faults.ts` breaks things. Clients behave like the real editor:
unacknowledged updates are kept and replayed, and a close code that makes the editor give up stops the client for good.

**Pass criteria:** every update a writer produced is eventually acknowledged; no acknowledged update is missing from the
persisted document; every client ends with exactly the persisted document; no client gives up; every server that was not
deliberately killed is still healthy.

### Scenarios

| Scenario | Faults |
| --- | --- |
| `redis` | Redis paused 4 s. One instance frozen (`SIGSTOP`) while the event stream is wiped for 5 s, then resumed. Convergence is checked **before any reconnect**, which would hide a missed event. Then `kill -9` on that instance. |
| `database` | PostgreSQL paused 6 s, then killed and started again 9 s later. Some clients lose their connection and reconnect during both. |
| `outage` | PostgreSQL stopped for 90 s, then Redis stopped for 90 s. Some clients reconnect halfway through each. |

### Results

Run on 2026-11-25 with Node 22 on a busy Apple M3 laptop, PostgreSQL 16 and Redis 7 in Docker.

| | `redis` | `database` | `outage` (90 s each) |
| --- | --- | --- | --- |
| Updates produced / acknowledged | 2,377 / 2,377 | 2,330 / 2,330 | 12,120 / 12,120 |
| Acknowledged but missing from the document | 0 | 0 | 0 |
| Clients behind at the end of any checkpoint | 0 | 0 | 0 |
| Clients that gave up | 0 | 0 | 0 |
| Servers healthy afterwards | 1 of 1 (one killed on purpose) | 2 of 2 | 2 of 2 |
| Reconnects / resync requests | 14 / 8 | 16 / 0 | 22 / 90 |
| Result | Pass | Pass | Pass |

In the `outage` run, clients converged 22 s after writing stopped following the Redis outage.

With `--no-sync-check`, the `redis` scenario fails as expected: 8 clients were still behind 35 s after the frozen
instance resumed.

### What it found, and what changed

Each of these was seen in a failing run, then fixed.

From the `redis` scenario:

1. **Silent divergence.** After the freeze and flush, readers on the frozen instance stayed behind with open sockets and
   no error. Every open document now broadcasts its latest persisted version every 10 s (`sync.check`); a client behind
   on two consecutive checks asks for the state.
2. **The first version of that fix didn't work.** Clients tracked the *highest* version seen, so later updates hid the
   gap. They now track the highest *contiguous* version.
3. **A reconnect storm.** A client replayed its backlog as hundreds of messages, hit the 40 messages/second limit, was
   disconnected, and repeated. 832 updates were never acknowledged. The backlog is now merged on replay and the client
   backs off.

From the `database` scenario:

4. **Both API servers crashed** when PostgreSQL was killed, and stayed down: the driver's `error` event had no listener.
5. **People were told they were signed out.** A session that couldn't be *checked* closed the socket with the same code
   as no session, so the editor gave up. It now closes with `1013` (try again), and the web app shows "Can't reach
   SyncSpace" instead of redirecting to sign-in.
6. **Failed saves were never retried.** The server sent an error and kept the socket open, leaving a hole that hid later
   edits. A failed save now closes with `1013`, so the client reconnects and resends.

Found by reading the code while extending these tests, and covered by unit tests rather than a fault run: a backlog
larger than one message is now split, and a single edit too large to ever be accepted is reported as not saved.

### Limits of these tests

One machine and one timeline per scenario. Not covered: network partitions between servers, or between browser and
API; a full disk; PostgreSQL failover to a replica; outages longer than 90 s. From reading the code, not from a test:
while Redis is down, actions that notify other servers (such as removing a member) wait until it returns. Resync is
bounded by the 10 s check interval and needs two checks, so a client can be stale for 20 s or somewhat longer on a loaded machine.
