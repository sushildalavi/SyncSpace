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

## Results

| Run | Clients | Updates | Connect p95 | Ack p50 / p95 / p99 | Propagation p50 / p95 / p99 | Acked | Diverged clients |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4 docs × (5 writers + 20 readers), 40 ms interval | 100 | 2,000 | 55 ms | 2.6 / 8.0 / 12.8 ms | 3.4 / 9.4 / 14.8 ms | 2,000 / 2,000 | 0 |
| 8 docs × (5 writers + 30 readers), 60 ms interval | 280 | 4,000 | 83 ms | 11.4 / 64.0 / 85.6 ms | 12.8 / 66.2 / 88.3 ms | 4,000 / 4,000 | 0 |

Propagation counts every (update, reader) delivery: 40,000 and 120,000 samples respectively.

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
- Latency grows with offered load (p95 ack 8 ms → 64 ms going from ~500 to ~550 acked updates/s with 2.8× the readers).
  Each update is one PostgreSQL transaction (row-locked version bump + insert) followed by a stream append.

## Not done

Fault injection (killing an instance or pausing Redis mid-run) was **not** performed under load. The behaviour is designed
and unit-tested (`docs/failure-modes.md`), but not measured. Long soak runs and multi-machine runs are also untested.
