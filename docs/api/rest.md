# REST API

Cookie session required unless marked public. State-changing requests must carry `Origin: <WEB_ORIGIN>`. Errors are
`{ statusCode, message }`. People without access receive `404`, insufficient role `403`, last-owner violations `409`.

| Method & path | Role | Notes |
| --- | --- | --- |
| `GET /health`, `GET /config` | public | liveness; `{ googleEnabled, requireEmailVerification }` |
| `/api/auth/*` | public/session | Better Auth: sign-up/in/out, verification, reset, sessions, accounts, Google, email change, two-factor |
| `GET /me`, `GET /me/security-events` | any | |
| `GET /me/deletion`, `DELETE /me` `{ confirmEmail, password? }` | any | preview, then delete. `409` while the only owner of a shared workspace; accounts without a password need a sign-in from the last 10 minutes |
| `GET/POST /workspaces`, `GET/PATCH/DELETE /workspaces/:id` | member / owner | create is transactional |
| `GET /workspaces/:id/members` | member | |
| `PUT/DELETE /workspaces/:id/members/:userId` | owner (self-leave allowed) | last owner protected |
| `GET/POST /workspaces/:id/invitations`, `DELETE …/:invitationId` | owner | emailed single-use link |
| `GET /invitations`, `POST /invitations/:id/accept`, `POST /invitations/preview`, `POST /invitations/accept` | invitee | email must match |
| `GET/POST /workspaces/:id/documents` | member / editor+ | `?q=` filters by title |
| `GET/PATCH/DELETE /documents/:id` | reader / writer / workspace editor+ | `workspaceRole` is `null` for a guest |
| `GET/PUT /documents/:id/shares` `{ email, role }`, `DELETE …/:shareId` | workspace owner | share one document as viewer or editor. A guest also sees that document's version history and who edited it |
| `GET /documents/shared` | any | documents shared with you from workspaces you don't belong to |
| `PUT/DELETE /documents/:id/favorite`, `GET /documents/recent`, `GET /documents/favorites`, `GET /search?q=` | reader | |
| `GET /documents/:id/history`, `GET /documents/:id/history/:version` | reader | read-only reconstruction |
| `POST /documents/:id/restore` `{ version }` | writer | rewinds the content as a **new** version (history is never rewritten) and pushes it to open editors live |
| `GET/PUT/DELETE /workspaces/:id/integrations/:provider`, `POST …/send` | member / owner / editor+ | webhook hosts are allow-listed |
