# REST API

Cookie session required unless marked public. State-changing requests must carry `Origin: <WEB_ORIGIN>`. Errors are
`{ statusCode, message }`. Non-members receive `404`, insufficient role `403`, last-owner violations `409`.

| Method & path | Role | Notes |
| --- | --- | --- |
| `GET /health`, `GET /config` | public | liveness; `{ googleEnabled, requireEmailVerification }` |
| `/api/auth/*` | public/session | Better Auth: sign-up/in/out, verification, reset, sessions, accounts, Google |
| `GET /me`, `GET /me/security-events` | any | |
| `GET/POST /workspaces`, `GET/PATCH/DELETE /workspaces/:id` | member / owner | create is transactional |
| `GET /workspaces/:id/members` | member | |
| `PUT/DELETE /workspaces/:id/members/:userId` | owner (self-leave allowed) | last owner protected |
| `GET/POST /workspaces/:id/invitations`, `DELETE …/:invitationId` | owner | emailed single-use link |
| `GET /invitations`, `POST /invitations/:id/accept`, `POST /invitations/preview`, `POST /invitations/accept` | invitee | email must match |
| `GET/POST /workspaces/:id/documents` | member / editor+ | `?q=` filters by title |
| `GET/PATCH/DELETE /documents/:id` | member / editor+ / editor+ | |
| `PUT/DELETE /documents/:id/favorite`, `GET /documents/recent`, `GET /documents/favorites`, `GET /search?q=` | member | |
| `GET /documents/:id/history`, `GET /documents/:id/history/:version` | member | read-only reconstruction |
| `POST /documents/:id/restore` `{ version }` | editor+ | rewinds the content as a **new** version (history is never rewritten) and pushes it to open editors live |
| `GET/PUT/DELETE /workspaces/:id/integrations/:provider`, `POST …/send` | member / owner / editor+ | webhook hosts are allow-listed |
