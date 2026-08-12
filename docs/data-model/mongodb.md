# MongoDB Data Model

## Collections

- `users`
- `workspaces`
- `workspace_memberships`
- `documents`
- `document_snapshots`
- `document_updates`
- `sessions`

## Important indexes

- `users.email` unique: fast sign-in and duplicate prevention.
- `workspace_memberships.workspaceId + userId` unique: one membership per user per workspace.
- `workspace_memberships.userId + role`: list accessible workspaces by role.
- `documents.workspaceId + updatedAt`: workspace document listing.
- `documents.workspaceId + title`: workspace search/filtering.
- `document_updates.documentId + updateId` unique: dedupe retries and repeated delivery.
- `document_updates.documentId + receivedAt`: ordered replay and recovery.
- `document_snapshots.documentId + version` unique: versioned restore points.
- `sessions.jti` unique and `sessions.expiresAt` TTL: token/session lifecycle.

## Durability rules

- Document state is not overwritten with last-write-wins semantics.
- Updates are append-only and deduplicated by stable update identity.
- Snapshots compact history, but do not replace update ordering as the authoritative replay trail.
