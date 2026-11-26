# Testing and accessibility

## Test suites

| Layer | Command | What it covers |
| --- | --- | --- |
| Unit / integration | `pnpm test` | **API** (Vitest on in-process PostgreSQL via PGlite, with the real migrations): RBAC, atomic workspace creation, last-owner protection, invitations, single-document sharing, two-factor sign-in, email change and account deletion (against Better Auth's real handler), database connection loss, server-assigned versions, idempotency, concurrent writers, snapshots, historical state, two collaboration instances over real WebSockets (viewer writes, revocation, cross-instance delivery), MongoDB migrator, legacy password upgrade. **Web**: helpers, sync-status logic and the collaboration provider against a fake socket (backlog merge, gap detection, backoff, no reconnect after access removal, honest save status, oversized backlogs). **Config**, **loadtest stats**. |
| Browser end-to-end | `pnpm test:e2e` | Real Next.js + NestJS + PostgreSQL + Redis + Mailpit (`playwright.config.ts` starts them): email auth, verification, recovery, session revocation, Google OAuth against a protocol mock, workspaces, invitations, role changes, live revocation, two-browser collaboration, offline sync, viewer enforcement over a raw socket, formatting persistence, responsive overflow at 375/768/1024/1440, theme persistence, keyboard flows, two-factor sign-in, email change, account deletion, guest access to one document, page titles, headings and 320 px reflow, axe WCAG 2.2 AA scans in light and dark. |
| Screenshots | `SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts` | Regenerates `docs/screenshots/*` from the real UI. |
| Load | `scripts/bench.sh` | See [speed](performance.md#speed). |
| Fault injection | `scripts/faultInjection.sh` | Redis, PostgreSQL and instance failures under write load, including long outages. See [failure testing](performance.md#failure-testing). |

E2E prerequisites: `docker compose up -d postgres redis mailpit` and `createdb syncspace_test`
(`docker compose exec postgres psql -U syncspace -d postgres -c "create database syncspace_test"`).
Playwright builds and starts the apps itself (API on 3101, web on 3100, mock Google on 3199).

Each test registers its own users with random emails, so tests are independent and run in parallel. Each browser context
sends a distinct `X-Forwarded-For` (the API runs with `TRUST_PROXY=1` in tests) so the real rate limiter stays enabled.

## Accessibility

The target is WCAG 2.2 AA. This records what has been checked and, as important, what hasn't.

### Checked automatically on every pull request

- axe's WCAG 2.2 A and AA rules on the sign-in pages, every signed-in page and the share, two-factor and account
  deletion screens, mostly in light and dark (`e2e/ui.spec.ts`, `e2e/account.spec.ts`, `e2e/sharing.spec.ts`).
- Each page has its own title, one main region, one first-level heading and no skipped heading level.
- No horizontal scrolling at 320 px.
- In-app navigation renames the page, which is what the route announcer reads.
- Keyboard: skip link, command menu, mobile drawer and dialog focus, formatting shortcuts, and that Tab can leave the
  editor from inside a list.

### Structure review (2026-11-25)

The accessibility tree, headings, titles, focus order, forced-colors focus and 320 px reflow were inspected in
Chromium, and these were fixed:

| Problem | Fix |
| --- | --- |
| Most pages were titled "SyncSpace" | Every page names itself |
| The document page had no main heading | Added one carrying the document title |
| A sidebar label was a heading above the page heading | No longer a heading |
| Empty and error states skipped heading levels | Level follows the page |
| The 404 page had no main region | New page with a heading and a way home |
| The security page overflowed at 320 px | Buttons wrap |
| The title field had a faint focus indicator | Standard focus ring |
| "1 people here" | "1 person here" |

### Not done

- **No screen-reader testing.** Nobody has used the app with VoiceOver, NVDA, JAWS or TalkBack. Inspecting the
  accessibility tree does not show how announcements sound or whether live editing is understandable.
- No testing with people who use assistive technology, and no manual audit against every criterion.
- Collaborators' arrivals, departures and edits are not announced.
- Browsers other than Chromium were not checked.

A short manual pass with VoiceOver would be: sign in, create a document, format a list, open Share, add a person, turn on
two-factor sign-in, and have a second person edit while you read.
