# MongoDB → PostgreSQL migration runbook

The migrator (`apps/api/scripts/migrate-from-mongo.ts`, logic in `src/migration/mongo-migrator.ts`) is **read-only
against MongoDB** and never deletes source data.

## What it does

| Legacy | PostgreSQL | Notes |
| --- | --- | --- |
| `users` | `user` + `account` (credential) | Ids preserved. Emails lower-cased. Duplicate emails are merged and reported. Invalid emails are skipped and reported. The bcrypt hash is carried over and **upgraded to Argon2id on the user's next sign-in**. Users are imported as `emailVerified=false`, and with `REQUIRE_EMAIL_VERIFICATION=true` they receive a confirmation email on first sign-in. |
| `workspaces`, `workspacememberships`, `workspaceintegrations` | `workspace`, `workspace_member`, `workspace_integration` | Ids preserved. Dangling references and unknown roles are skipped and reported. Each workspace's creator is guaranteed an owner membership. |
| `documents` | `document` | Ids preserved. Non-UUID ids are skipped and reported. |
| `documentupdates` | `document_update` | Re-ordered by arrival time and given **server-assigned versions 1..N** (legacy versions were chosen by clients). Duplicate `updateId`s and corrupt payloads are skipped and reported. |
| `documentsnapshots` | *(not copied)* | Their version numbers referred to client-chosen versions and can't be mapped. The full update history is migrated instead and the new service snapshots on its own. |
| Y.Text `body` | also Y.XmlFragment `default` | Plain-text documents get one extra update (`migration-richtext-v1`) that adds paragraphs for the new rich-text editor. The original `body` text is kept. Documents that are already rich text are untouched. |

Each document migrates in its own transaction. Re-running is safe: existing rows are left alone.

## Verification

After copying, every document is rebuilt from PostgreSQL and compared with the document rebuilt from MongoDB using
the legacy loader. The report lists per-table counts (`source / migrated / skipped`), every issue, the number of
documents compared and equal, and a SHA-256 checksum over all original update payloads on both sides. The CLI
exits non-zero if any document differs.

## Cutover

1. Take a MongoDB backup: `mongodump --uri "$LEGACY_MONGO_URL" --out backup-$(date +%F)`.
2. Start PostgreSQL and run a **dry run**. It validates and compares inside a transaction that is rolled back:
   ```bash
   LEGACY_MONGO_URL=mongodb://localhost:27017/syncspace \
   DATABASE_URL=postgres://syncspace:syncspace@localhost:5432/syncspace \
   pnpm --filter @syncspace/api migrate:mongo -- --dry-run
   ```
3. Read the `issues` list. Fix or accept each one.
4. Stop the old API (so no new writes land in MongoDB) and run the migration for real (same command without `--dry-run`).
   Confirm `verification.mismatches` is empty and the checksums match.
5. Start the new API and web app against PostgreSQL. Smoke test: sign in, open a migrated document.
6. Keep MongoDB (read-only) for your rollback window.

## Rollback

Nothing in MongoDB was changed, so rolling back is a deployment rollback: stop the new stack and start the previous
release against MongoDB. Edits made *after* cutover exist only in PostgreSQL. To roll back after users have written
data, export what you need from PostgreSQL first. To retry a migration from scratch:
`dropdb syncspace && createdb syncspace` and rerun step 4.

## Schema migrations

PostgreSQL schema changes are versioned SQL in `apps/api/drizzle/`, generated with `pnpm db:generate` and applied at
API start (`RUN_MIGRATIONS=true`) or with `pnpm db:migrate`. Drizzle migrations are forward-only. To undo one, restore
a backup or write a compensating migration.
