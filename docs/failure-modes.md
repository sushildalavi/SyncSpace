# Failure modes

| Failure | Behaviour |
| --- | --- |
| Browser goes offline | Status shows **Offline**. Edits keep applying locally and are queued in IndexedDB. On reconnect they replay idempotently. |
| API instance crashes (`kill -9`) or a socket drops | Client reconnects with jittered backoff (longer after a `4429`), receives fresh state, and replays its unacknowledged backlog **as one merged update**. Tested. |
| Instance frozen then resumed (GC pause, VM stall) | Its sockets are intact but it may have missed events. Same resync path as above. Tested. |
| Redis unavailable, restarted or its stream wiped | Writes still persist to PostgreSQL. Publishes queue and are delivered when Redis returns. If events were destroyed, `sync.check` (every 10 s) shows clients they are behind and they resync, typically within ~20 s. `/health` reports `redis:false` meanwhile. Tested: `docs/benchmarks/fault-injection.md`. |
| PostgreSQL unavailable, restarted or crashed | The API stays up. An update that can't be saved closes the socket with `1013`, so the client reconnects with backoff and resends everything unacknowledged. Nobody is reported as signed out; the web app shows **Can't reach SyncSpace** if it can't check the session. `/health` reports `postgres:false`. Tested. |
| Duplicate delivery / retries | `(document_id, update_id)` is unique, so duplicates are acked without a new version. |
| Two people edit at once | Yjs merges both. Versions are serialised by the document row lock. |
| Member removed / role changed | Event closes or downgrades sockets on every instance immediately. The 15 s sweep and the per-write role check cover missed events. |
| Session revoked | Sockets for that session close with `4411`. REST calls return `401` on the next request (no cookie cache). |
| Offline backlog larger than one message | Split into as few messages as fit. |
| A single edit too large to accept (about 1 MB) | Reported in the editor as not saved. |
| Corrupt or forged update | Rejected as `malformed` before persisting. |
| Snapshot race | Snapshots are `ON CONFLICT DO NOTHING` and `snapshot_version` only moves forward. |

Fault-injection results and their limits: [docs/benchmarks/fault-injection.md](benchmarks/fault-injection.md).
