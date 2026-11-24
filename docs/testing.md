# Testing

| Layer | Command | What it covers |
| --- | --- | --- |
| Unit / integration | `pnpm test` | **API** (Vitest on in-process PostgreSQL via PGlite, with the real migrations): RBAC, atomic workspace creation, last-owner protection, invitations, server-assigned versions, idempotency, concurrent writers, snapshots, historical state, two collaboration instances over real WebSockets (viewer writes, revocation, cross-instance delivery), MongoDB migrator, legacy password upgrade. **Web**: helpers and sync-status logic. **Config**, **loadtest stats**. |
| Browser end-to-end | `pnpm test:e2e` | Real Next.js + NestJS + PostgreSQL + Redis + Mailpit (`playwright.config.ts` starts them): email auth, verification, recovery, session revocation, Google OAuth against a protocol mock, workspaces, invitations, role changes, live revocation, two-browser collaboration, offline sync, viewer enforcement over a raw socket, formatting persistence, responsive overflow at 375/768/1024/1440, theme persistence, keyboard flows, axe WCAG 2.2 AA scans in light and dark. |
| Screenshots | `SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts` | Regenerates `docs/screenshots/*` from the real UI. |
| Load | `scripts/bench.sh` | See `docs/benchmarks/collaboration.md`. |

E2E prerequisites: `docker compose up -d postgres redis mailpit` and `createdb syncspace_test`
(`docker compose exec postgres psql -U syncspace -d postgres -c "create database syncspace_test"`).
Playwright builds and starts the apps itself (API on 3101, web on 3100, mock Google on 3199).

Each test registers its own users with random emails, so tests are independent and run in parallel. Each browser context
sends a distinct `X-Forwarded-For` (the API runs with `TRUST_PROXY=1` in tests) so the real rate limiter stays enabled.
