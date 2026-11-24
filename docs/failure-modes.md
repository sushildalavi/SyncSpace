# Failure modes

| Failure | Behaviour |
| --- | --- |
| Browser goes offline | Status shows **Offline**. Edits keep applying locally and are queued in IndexedDB. On reconnect they replay idempotently. |
| API instance restarts / socket drops | Client reconnects with jittered backoff, receives fresh state, replays unacked updates. |
| Redis unavailable | Cross-instance fan-out stops, and writes still persist to PostgreSQL. Clients on other instances see changes after they reconnect/reload. `/health` reports `redis:false`. |
| PostgreSQL unavailable | Writes fail with an error to the sender (no ack, so the UI keeps showing **Saving…** and the update stays queued). `/health` reports `postgres:false`. |
| Duplicate delivery / retries | `(document_id, update_id)` is unique, so duplicates are acked without a new version. |
| Two people edit at once | Yjs merges both. Versions are serialised by the document row lock. |
| Member removed / role changed | Event closes or downgrades sockets on every instance immediately. The 15 s sweep and the per-write role check cover missed events. |
| Session revoked | Sockets for that session close with `4411`. REST calls return `401` on the next request (no cookie cache). |
| Corrupt or forged update | Rejected as `malformed` before persisting. |
| Snapshot race | Snapshots are `ON CONFLICT DO NOTHING` and `snapshot_version` only moves forward. |

Not yet fault-injected under load (Redis pause, instance kill mid-run). See *Limitations* in the README.
