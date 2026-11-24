# Collaboration WebSocket

`GET ws(s)://<api>/collaboration?documentId=<uuid>&clientId=<optional>`

Authentication is the session **cookie** (sent automatically; credentials in the URL are ignored). The `Origin` header must equal
`WEB_ORIGIN`. Max message size 2 MB; 40 messages/second per connection.

## Client → server

| `type` | `payload` |
| --- | --- |
| `document.update` | `{ documentId, updateId, payload }`. `payload` is a base64 Yjs *incremental* update. **No version is accepted.** |
| `presence.update` | `{ status: "active" \| "idle", cursor?: object }` |
| `sync.request` | `{}`. Ask for the full state again (sent automatically when the client notices it missed events). |

## Server → client

| `type` | Meaning |
| --- | --- |
| `document.snapshot` | `{ documentId, version, snapshot, role, connectionId }`, the full state on connect |
| `document.ack` | `{ updateId, version, duplicate }`, persisted |
| `document.rejected` | `{ updateId, reason: "read_only" \| "malformed" \| "wrong_document" }` |
| `document.update` | `{ documentId, updateId, version, payload, actorId }` from someone else |
| `sync.check` | `{ documentId, version }`, the latest persisted version, sent every 10 s. A client whose highest *contiguous* version is lower on two checks in a row should send `sync.request`. |
| `access.updated` | `{ role }`, your role changed live |
| `access.revoked` | `{ code, reason }`, followed by close |
| `presence.sync` / `presence.state` / `presence.leave` | other collaborators (identity stamped by the server) |

## Close codes

`4401` not signed in · `4403` origin not allowed · `4404` no such document / no access · `4410` access removed ·
`4411` session revoked · `4429` rate limited. Any other close is treated by the client as transient and retried.
