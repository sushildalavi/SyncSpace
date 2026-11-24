# Fault injection

**Reproduce:** `docker compose up -d postgres redis && scripts/fault-injection.sh` (add `--no-sync-check` to disable the
resync mechanism and see what it prevents). Needs `lsof`. About 75 seconds.

Two API instances share one PostgreSQL and one Redis. 22 clients (6 writers, 16 readers, 2 documents) are spread across
both instances and keep editing while `apps/loadtest/src/faults.ts` injects:

| When | Fault | What it models |
| --- | --- | --- |
| 5 s | `docker pause redis` for 4 s | Redis stalls: fan-out stops, publishes queue |
| 12 s | `SIGSTOP` instance :3202 | A long GC pause or VM stall: the process is frozen but its TCP sockets stay open |
| 12.5 s | `FLUSHALL` on Redis for 5 s | Events published during the freeze are destroyed, so the frozen instance can never read them |
| 18.5 s | `SIGCONT` the instance | It resumes with open sockets and missed events |
| 30 s | writers stop; **convergence is checked before any reconnect** | Reconnecting would hide a missed event, so this is measured first |
| then | a second write burst, `kill -9` on :3202 after 3 s | A crash: sockets drop with no close frame |

Clients behave like the real editor: unacknowledged updates are kept and replayed after reconnecting to a surviving
instance. Pass criteria: every update a writer produced is eventually acknowledged; **no acknowledged update is missing from the
persisted document**; every client ends with exactly the persisted document, including before the crash.

## Results (Apple M3, Node 26, Docker PostgreSQL 16 / Redis 7)

| | Sync checks OFF | Sync checks ON |
| --- | --- | --- |
| Updates produced / acknowledged | 2,382 / 2,382 | 2,371 / 2,371 |
| Acknowledged but missing from the document | 0 | 0 |
| Clients behind the persisted doc, before any reconnect | **8 (still behind after 35 s)** | 0 |
| Resync requests | 0 | 8 |
| Reconnects (the crash) | 14 | 14 |
| Result | **FAIL** | **PASS** |

## What it found, and what changed

Running this scenario found three defects that unit tests had not:

1. **Silent divergence.** After the freeze and flush, readers on the frozen instance stayed permanently behind with open
   sockets and no error. **Fix:** every open document broadcasts its latest persisted version every 10 s (`sync.check`);
   a client that is behind on two consecutive checks sends `sync.request` and receives the state.
2. **The first version of that fix didn't work.** Clients tracked the *highest* version seen, so later updates from a local
   writer hid the gap (0 resync requests, still failing). Versions are gap-free, so clients now track the highest
   *contiguous* version. A unit test covers exactly this case.
3. **A reconnect storm.** After an outage, a client replayed its backlog as hundreds of separate messages, exceeded the
   server's 40 messages/second limit, was disconnected with `4429`, reconnected, and replayed again forever. In that run
   832 updates were never acknowledged and the client reconnected 5,283 times. **Fix:** the backlog is merged into one update
   on replay (safe: Yjs updates merge and re-applying is a no-op), reconnect delay resets only after a connection stays up for
   10 s, and a `4429` close forces a longer wait.

## Limits of this test

The harness also records the longest gap between acknowledgements, but that figure is not reported here: it includes idle time
(writers stop while the run waits to converge, and a run that fails to converge waits longest), so it measures run length rather
than stalls.

One machine, one fault timeline, one seed. It does not cover PostgreSQL failure, network partitions between the browser and
API, multi-minute outages, or very large backlogs (a merged replay above the 2 MB message limit would be rejected). Resync
latency is bounded by the 10 s check interval, so a client can be stale for up to about 20 s.
