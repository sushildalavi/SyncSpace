# Collaboration benchmark

**Reproduce:** `docker compose up -d postgres redis && scripts/bench.sh --docs 8 --writers 5 --readers 30 --updates 100 --interval 60`

`scripts/bench.sh` creates a fresh database, starts **two API instances** (ports 3201/3202) sharing one PostgreSQL and
one Redis, then `apps/loadtest` signs up a real user and opens authenticated WebSocket clients alternately on both
instances. Writers apply Yjs edits and send incremental updates. Readers are on both instances, so most deliveries
cross instances via the Redis stream.

Measured per run: **connect** (socket open → state received), **ack** (update sent → persisted and acknowledged),
**propagation** (edit made by a writer → visible in a reader's document), throughput, and **convergence** (every client of
a document must hold identical text). The run exits non-zero on any divergence, unacked update or rejection.

Environment: Apple M3 laptop, Node 26, PostgreSQL 16 and Redis 7 in Docker, API and load generator on the same machine.
These are single-machine numbers, so use them for relative comparison and regression detection, not capacity planning.

## Results (2026-11-25, commit `d43d692`)

Median of three runs, with the lowest and highest run in brackets. Times are in milliseconds.

| Run | Clients | Ack p50 | Ack p95 | Propagation p50 | Propagation p95 | Acked | Diverged clients |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4 docs × (5 writers + 20 readers), 40 ms interval | 100 | 4.7 (4.2–5.0) | 11 (10–82) | 5.5 (5.1–5.9) | 12 (12–91) | 6,000 / 6,000 | 0 |
| 8 docs × (5 writers + 30 readers), 60 ms interval | 280 | 17.5 (17.4–20.4) | 80 (75–98) | 19.7 (19.5–22.6) | 85 (78–100) | 12,000 / 12,000 | 0 |

Each run sends 2,000 or 4,000 updates. The 280-client run handled about 540 updates per second.

### Cost of single-document sharing

The same runs on the commit before sharing was added (`597e637`), alternating with the new code on the same machine:

| Clients | Ack p50, before → after | Ack p95, before → after |
| --- | --- | --- |
| 100 | 3.4 → 4.7 | 14 → 11 (too noisy to compare) |
| 280 | 15.4 → 17.5 | 72 → 80 |

Typical (p50) acknowledgement is 1–2 ms slower, and p95 at 280 clients about 10% slower. Before each save the server now
makes two more database queries, to check both workspace membership and direct shares. That is the likely cause; it was
not isolated by profiling. Combining the checks into one query has not been tried.

The machine was not idle (load average near 10 when the runs began), and single p95 values varied widely, so treat small
differences with caution. Earlier results published here (p95 ≈ 64 ms at 280 clients) came from a separate session and
are not comparable.

## Before vs. after

The previous `apps/loadtest` connected with the literal token `loadtest` (which the server rejected) and sent only presence
messages, and it recorded no latency, throughput or correctness data. There was **no usable baseline** to compare against.
The numbers above are the first real measurements, and the old design had correctness problems that no benchmark would
show (updates reaching only one instance, client-chosen versions, snapshot count scanned on every write).

## What the tests showed about limits

- An early run at a 20 ms write interval offered 33–100 messages/second per writer. The server's per-connection limit
  (40 msg/s, close code `4429`) correctly disconnected those writers, and the run failed its own acked/convergence checks.
  The real editor batches to ~50 ms (≤ 20 msg/s), so this is the limiter working. It does mean the load test must stay
  under the limit to measure the data path.
- Latency grows with load: median acknowledgement rises from about 5 ms with 100 clients to about 18 ms with 280.
  Each update is one PostgreSQL transaction (row-locked version bump + insert) followed by a stream append.

## Not done

Fault injection has its own runs: [fault-injection.md](fault-injection.md). Long soak runs and multi-machine runs are still untested.
