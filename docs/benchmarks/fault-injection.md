# Fault injection

**Reproduce** (needs Docker and `lsof`; it starts its own throwaway PostgreSQL and Redis, so development data is not touched):

```bash
scripts/fault-injection.sh --scenario redis               # about 75 s
scripts/fault-injection.sh --scenario database            # about 45 s
scripts/fault-injection.sh --scenario outage --outage 90  # about 4 min
```

Add `--no-sync-check` to the `redis` scenario to disable the resync mechanism and see what it prevents.

Two API instances share one PostgreSQL and one Redis. 22 clients (6 writers, 16 readers, 2 documents) are spread across
both and keep editing while `apps/loadtest/src/faults.ts` breaks things. Clients behave like the real editor:
unacknowledged updates are kept and replayed, and a close code that makes the editor give up stops the client for good.

**Pass criteria:** every update a writer produced is eventually acknowledged; no acknowledged update is missing from the
persisted document; every client ends with exactly the persisted document; no client gives up; every server that was not
deliberately killed is still healthy.

## Scenarios

| Scenario | Faults |
| --- | --- |
| `redis` | Redis paused 4 s. One instance frozen (`SIGSTOP`) while the event stream is wiped for 5 s, then resumed. Convergence is checked **before any reconnect**, which would hide a missed event. Then `kill -9` on that instance. |
| `database` | PostgreSQL paused 6 s, then killed and started again 9 s later. Some clients lose their connection and reconnect during both. |
| `outage` | PostgreSQL stopped for 90 s, then Redis stopped for 90 s. Some clients reconnect halfway through each. |

## Results (Apple M3, Node 26, Docker PostgreSQL 16 / Redis 7)

| | `redis` | `database` | `outage` (90 s each) |
| --- | --- | --- | --- |
| Updates produced / acknowledged | 2,380 / 2,380 | 2,378 / 2,378 | 12,263 / 12,263 |
| Acknowledged but missing from the document | 0 | 0 | 0 |
| Clients behind at any checkpoint | 0 | 0 | 0 |
| Clients that gave up | 0 | 0 | 0 |
| Servers healthy afterwards | 1 of 1 (one killed on purpose) | 2 of 2 | 2 of 2 |
| Reconnects / resync requests | 14 / 8 | 16 / 0 | 22 / 70 |
| Result | **PASS** | **PASS** | **PASS** |

In the `outage` run, clients converged 6.5 s after writing stopped following the Redis outage.

## What it found, and what changed

Each of these was seen in a failing run, then fixed.

From the `redis` scenario:

1. **Silent divergence.** After the freeze and flush, readers on the frozen instance stayed behind with open sockets and
   no error. Every open document now broadcasts its latest persisted version every 10 s (`sync.check`); a client behind
   on two consecutive checks asks for the state. With `--no-sync-check`, 8 clients were still behind after 35 s.
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

## Limits of these tests

One machine and one timeline per scenario. Not covered: network partitions between servers, or between browser and
API; a full disk; PostgreSQL failover to a replica; outages longer than 90 s. From reading the code, not from a test:
while Redis is down, actions that notify other servers (such as removing a member) wait until it returns. Resync is
bounded by the 10 s check interval, so a client can be stale for up to about 20 s.
