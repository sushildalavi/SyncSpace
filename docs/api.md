# API

## REST

Cookie session required unless marked public. State-changing requests must carry `Origin: <WEB_ORIGIN>`. Errors are
`{ statusCode, message }`; validation errors add `issues`. People without access receive `404`, insufficient role `403`,
last-owner violations `409`. Request body schemas are in
[`packages/contracts`](../packages/contracts/src/index.ts).

`/api/auth/*` is rate limited per client address and route: 100 requests a minute by default, 3 per 10 seconds on
sign-in, sign-up, password change, email change and `/two-factor/*`, and 3 per 60 seconds on password reset and
verification email requests. Account deletion and collaboration socket messages have their own limits. Other REST
routes have none.

| Method & path | Role | Notes |
| --- | --- | --- |
| `GET /health`, `GET /config` | public | `{ ok, service, postgres, redis }`, always `200`, so check `ok`; `{ googleEnabled, requireEmailVerification }` |
| `GET /` | public | redirects to the web app |
| `/api/auth/*` | public/session | Better Auth: sign-up/in/out, verification, reset, sessions, accounts, Google, email change, two-factor |
| `GET /me`, `GET /me/security-events` | any | |
| `GET /me/deletion`, `DELETE /me` `{ confirmEmail, password? }` | any | preview, then delete. `409` while the only owner of a shared workspace; accounts without a password need a sign-in from the last 10 minutes. `429` after 5 wrong passwords in 15 minutes |
| `GET/POST /workspaces`, `GET/PATCH/DELETE /workspaces/:id` | member / owner | create is transactional |
| `GET /workspaces/:id/members` | member | |
| `PUT/DELETE /workspaces/:id/members/:userId` | owner (self-leave allowed) | last owner protected |
| `GET/POST /workspaces/:id/invitations`, `DELETE …/:invitationId` | owner | emailed single-use link |
| `GET /invitations`, `POST /invitations/:id/accept`, `POST /invitations/preview` `{ token }`, `POST /invitations/accept` `{ token }` | invitee | accepting requires the invited email address; by id it must also be verified |
| `GET/POST /workspaces/:id/documents` | member / editor+ | `?q=` filters by title |
| `GET/PATCH/DELETE /documents/:id` | reader / writer / workspace editor+ | `workspaceRole` is `null` for a guest |
| `GET/PUT /documents/:id/shares` `{ email, role }`, `DELETE …/:shareId` | workspace owner | share one document as viewer or editor. A guest also sees that document's version history and who edited it |
| `GET /documents/shared` | any | documents shared with you from workspaces you don't belong to |
| `PUT/DELETE /documents/:id/favorite`, `GET /documents/recent`, `GET /documents/favorites`, `GET /search?q=` | reader | |
| `GET /documents/:id/history`, `GET /documents/:id/history/:version` | reader | read-only reconstruction |
| `POST /documents/:id/restore` `{ version }` | writer | rewinds the content as a **new** version (history is never rewritten) and pushes it to open editors live |
| `GET /workspaces/:id/integrations` | member | webhook URLs are returned masked |
| `PUT/DELETE /workspaces/:id/integrations/:provider` | owner | `provider` is `slack` or `teams`; webhook hosts are allow-listed |
| `POST /workspaces/:id/integrations/:provider/send` `{ title, summary, documentUrl }` | editor+ | posts to the saved webhook. The web app has no control that calls this |

## Collaboration WebSocket

`GET ws(s)://<api>/collaboration?documentId=<uuid>&clientId=<optional>`

Authentication is the session **cookie** (sent automatically; credentials in the URL are ignored). The `Origin` header must equal
`WEB_ORIGIN`. Max message size 2 MB; 40 messages/second per connection.

### Client → server

| `type` | `payload` |
| --- | --- |
| `document.update` | `{ documentId, updateId, payload }`. `payload` is a base64 Yjs *incremental* update. **No version is accepted.** |
| `presence.update` | `{ status: "active" \| "idle", cursor?: object }` |
| `sync.request` | `{}`. Ask for the full state again (sent automatically when the client notices it missed events). |

### Server → client

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
| `error` | `{ message }`, a message that could not be understood or handled. This one has no `payload` field |

### Close codes

`4401` not signed in · `4403` origin not allowed · `4404` no such document / no access · `4410` access removed ·
`4411` session revoked · `4429` rate limited · `1013` the server can't save or check right now, try again ·
`1001` server shutting down · `1011` unexpected server error.
Any close not starting with `44`, and also `4429`, is treated by the client as transient: it reconnects and resends.
