# Testing and accessibility

## Test suites

| Layer | Command | What it covers |
| --- | --- | --- |
| Unit / integration | `pnpm test` | **API** (Vitest on in-process PostgreSQL via PGlite, with the real migrations): RBAC, atomic workspace creation, last-owner protection, invitations, single-document sharing, two-factor sign-in, email change and account deletion (against Better Auth's real handler), database connection loss, server-assigned versions, idempotency, concurrent writers, snapshots, historical state, two collaboration instances over real WebSockets (viewer writes, revocation, cross-instance delivery), MongoDB migrator, legacy password upgrade. **Web**: helpers, sync-status logic and the collaboration provider against a fake socket (backlog merge, gap detection, backoff, no reconnect after access removal, honest save status, oversized backlogs). **Config**, **loadtest stats**. |
| Browser end-to-end | `pnpm test:e2e` | Real Next.js + NestJS + PostgreSQL + Redis + Mailpit (`playwright.config.ts` starts them): email auth, verification, recovery, session revocation, Google OAuth against a protocol mock, workspaces, invitations, role changes, live revocation, two-browser collaboration, offline sync, viewer enforcement over a raw socket, formatting persistence, responsive overflow at 375/768/1024/1440, theme persistence, keyboard flows, two-factor sign-in, email change, account deletion, guest access to one document, page titles, headings and 320 px reflow, axe WCAG 2.2 AA scans in light and dark. |
| Screenshots | `SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts` | Regenerates `docs/screenshots/*` from the real UI. |
| Load | `scripts/bench.sh` | See [speed](performance.md#speed). |
| Fault injection | `scripts/faultInjection.sh` | Redis, PostgreSQL and instance failures under write load, including long outages. See [failure testing](performance.md#failure-testing). |

Browser test prerequisites: `docker compose up -d postgres redis mailpit`, once
`docker compose exec postgres psql -U syncspace -d postgres -c "create database syncspace_test"`, and once
`pnpm exec playwright install chromium`. Playwright builds and starts the apps itself (API on 3101, web on 3100, mock
Google on 3199). `E2E_DATABASE_URL` and `E2E_REDIS_URL` point the tests at other servers; Mailpit is expected on ports
1025 and 8025. The type check does not cover `e2e/`.

Each test registers its own users with random emails, so tests are independent and run in parallel. Each browser context
sends a distinct `X-Forwarded-For` (the API runs with `TRUST_PROXY=1` in tests) so the real rate limiter stays enabled.

## Accessibility

The target is WCAG 2.2 AA. This records what has been checked and what hasn't.

### Checked automatically on every pull request

- axe's WCAG 2.2 A and AA rules on the sign-in pages, the signed-in pages and the share, two-factor and account
  deletion screens, in light and, for the page-level scans, dark (`e2e/ui.spec.ts`, `e2e/account.spec.ts`,
  `e2e/sharing.spec.ts`).
- Each page has its own title, one main region, one first-level heading and no skipped heading level.
- No horizontal scrolling at 320 px.
- In-app navigation renames the page, which is what the route announcer reads.
- Keyboard: skip link, command menu, mobile drawer and dialog focus, formatting shortcuts, and that Tab can leave the
  editor from inside a list.

The accessibility tree, focus order and forced-colors focus were also inspected by hand in Chromium (2026-11-25).

### Not done

- **No screen-reader testing.** Nobody has used the app with VoiceOver, NVDA, JAWS or TalkBack. Inspecting the
  accessibility tree does not show how announcements sound or whether live editing is understandable.
- No testing with people who use assistive technology, and no manual audit against every criterion.
- Collaborators' arrivals, departures and edits are not announced.
- Browsers other than Chromium were not checked.
