# ADR 0002: PostgreSQL with Drizzle replaces MongoDB

**Context.** The data is relational (users → memberships → workspaces → documents) and several invariants need transactions:
workspace + owner membership, last-owner protection, per-document version assignment, idempotent update inserts.
**Decision.** PostgreSQL as the only database; Drizzle ORM with SQL migrations. Drizzle was chosen over Prisma because it has
first-class `bytea` and `FOR UPDATE` support, produces plain reviewable SQL, has no generated client or engine binary, and is
supported by Better Auth's adapter.
**Consequences.** One datastore. MongoDB is retained only as a migration source (see `docs/modernization/migration.md`).
