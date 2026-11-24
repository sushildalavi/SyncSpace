# SyncSpace modernization baseline

Recorded 2026-11-23 on `main` at `81e1dc9`, before any modernization changes. Node v26.7.0, pnpm 10.15.1 (run via `npx`, since pnpm and corepack aren't installed locally).

## Repository vs. the brief

The layout matches the brief: `apps/{api,web,loadtest}`, `packages/{collaboration,contracts,config}` and `infrastructure/docker`. The remote is `sushildalavi/SyncSpace` and `gh` is authenticated as `sushildalavi`. There is no `.github/` directory. The last commit removed the workflows, so CI has to be recreated.

## Baseline results

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass |
| `pnpm typecheck` | Pass (6/6) |
| `pnpm test` | Pass, but only 2 API tests plus the small package tests |
| `pnpm build` | Pass. The web build works. `loadtest` emits no outputs, which gives a turbo warning. |
| `pnpm lint` | **Fails before any change.** `eslint: command not found` in `config`, `collaboration` and `loadtest`. These packages call `eslint .` but don't declare eslint. |
| Playwright e2e | Not run yet. It needs the stack running and browsers installed. |
| `docker compose up --build` | Builds. `/health` returns 200 and web returns 200. |
| Load test | **No usable baseline.** See below. |

### Pre-existing defects found while baselining

1. **Lint is broken** for the packages named above.
2. **The API container runs under `tsx`**, which doesn't emit decorator metadata. Nest logs "Name the type for the pipe of the parameter" for DTO bodies. Request validation may not run in Docker. This needs confirming with a request test.
3. **`apps/loadtest` can't measure anything.** It connects with the literal token `loadtest` (which the server rejects) and sends only presence messages. It records no latency, throughput or convergence.
4. The compose file ships a placeholder `JWT_SECRET`, and `NEXT_PUBLIC_API_BASE_URL` is `http://api:3001`. A browser can't resolve that hostname.

## Review findings, verified against the code

| # | Claim | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Tokens in localStorage | **Confirmed** | `apps/web/src/stores/auth.ts` stores `syncspace-token` in localStorage. |
| 2 | JWT in WebSocket URL | **Confirmed** | `collaboration.service.ts` reads `token` from the query string. |
| 3 | Viewers can write | **Confirmed** | `handleConnection` only checks that a membership exists. `processDocumentUpdate` never checks the role. |
| 4 | Client version is persisted | **Confirmed** | `persistUpdate` stores `params.version` and sets `currentVersion = max(current, version)`. A client can send `version: 1e9`. |
| 5 | Shared consumer group | **Confirmed** | All instances use group `syncspace-api`, so each stream entry goes to one instance. Peers on other instances miss updates. Entries from the same instance are acked and dropped. |
| 6 | Snapshot scans all updates | **Confirmed** | `snapshotIfNeeded` runs `countDocuments` over all updates after every edit. It never resets the count after a snapshot, so once past the threshold it snapshots on every update. `loadDocumentStateWithoutAuth` replays all updates, not just those after the snapshot. |
| 7 | Workspace plus membership not atomic | **Confirmed** | `create` makes two separate writes with no transaction. |
| 8 | No last-owner protection | **Confirmed** | `updateMemberRole` and `removeMember` have no owner-count check. |
| 9 | Sockets outlive access | **Confirmed** | Membership is checked once at connect. The JWT is never re-checked, and the `Session` schema is defined but unused. |

Additional issues found:

- The client sends `Y.encodeStateAsUpdate(doc)`, the full document state, on every keystroke. Cost grows with document size.
- The server never validates that `clientId` is the sender's.
- There is no rate limiting and no CSRF concern yet (bearer tokens). Both change once cookies are introduced.
- `bcryptjs` is used for passwords where the brief requires Argon2id.
- `GET /documents/:id/versions` returns raw snapshot blobs for the whole history.
- Presence is broadcast locally and written to a Redis stream, but nothing consumes it across instances.

## Next steps

Each real issue gets a failing regression test first, then a fix. Planned order:

1. Fix lint and the `tsx` decorator-metadata problem, so CI means something.
2. Security and correctness fixes for 3, 4, 7 and 8, with unit tests.
3. Server-assigned versions, a per-instance consumer group or pub/sub fan-out, and incremental snapshots.
4. Cookie sessions with revocation, WebSocket auth by cookie or ticket, and re-checking on membership change.
5. PostgreSQL schema, migrations and a MongoDB-to-Postgres migrator. MongoDB stays until the migration is verified.
6. A working load-test harness with latency and convergence metrics, then CI and docs.

## Outcome (after modernization)

| Review item | Status | Where it is covered |
| --- | --- | --- |
| 1. Token in localStorage | Fixed. HttpOnly session cookie, nothing readable by JS. | `e2e/auth.spec.ts`, `apps/web/src/lib/auth-client.ts` |
| 2. JWT in WebSocket URL | Fixed. Cookie + `Origin` check. Credentials in the URL are ignored. | `collaboration.service.spec.ts` ("does not accept credentials from the URL") |
| 3. Viewers can write | Fixed. Role re-read from the database on **every** write. | `collaboration.service.spec.ts`, `e2e/collaboration.spec.ts` (raw-socket forgery) |
| 4. Client-chosen versions | Fixed. Version assigned inside the transaction. | `documents.service.spec.ts` |
| 5. Shared consumer group | Fixed. Every instance `XREAD`s the full stream. | `collaboration.service.spec.ts` (two instances), `docs/benchmarks/collaboration.md` |
| 6. Snapshot scans/counts | Fixed. Two-integer check, bounded replay from the latest snapshot. | `documents.service.spec.ts` |
| 7. Non-atomic workspace creation | Fixed (transaction). | `workspaces.service.spec.ts` |
| 8. No last-owner protection | Fixed (row-locked check, 409). | `workspaces.service.spec.ts`, `e2e/collaboration.spec.ts` |
| 9. Sockets outlive access | Fixed. Event-driven close plus a 15 s database sweep. | `collaboration.service.spec.ts`, `e2e/collaboration.spec.ts` |

The brief asked for a failing regression test before each fix. That was **not** done in that order. The audit
was verified by reading the code, and the fixes were written together with the new architecture, so the tests were added alongside
them rather than demonstrated failing against the old code.

Baseline defects found and resolved: broken lint (now one root `eslint .`), missing decorator metadata under `tsx` (class-validator
replaced by the shared Zod contracts), and the non-functional load test (replaced, see `docs/benchmarks/collaboration.md`).
Defects found *during* the work (all fixed and tested): verification emails from an unverified sign-in linked to the API origin
instead of the app; Better Auth rate-limits only when it sees `X-Forwarded-For`, so the API now derives the client IP itself
(`TRUST_PROXY`); blank optional env vars from docker compose crashed startup.

## Later additions

Version restore and fault injection were added after the first review. Fault injection found three defects that the unit and e2e
tests had not (silent divergence after lost events, a first fix that tracked the wrong version, and a reconnect storm after long
outages). Details: `docs/benchmarks/fault-injection.md`. A security review of the branch found two Medium issues, both fixed:
reset/verification/invitation links were logged in plaintext when SMTP was unset (now only outside production), and publicly known
placeholder auth secrets (now rejected when `NODE_ENV=production`; dev data stores are bound to localhost).
