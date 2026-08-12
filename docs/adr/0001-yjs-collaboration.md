# ADR 0001: Use Yjs for CRDT Collaboration

## Decision

SyncSpace uses Yjs as the underlying CRDT implementation for collaborative text synchronization.

## Rationale

- Mature and battle-tested.
- Supports offline updates and eventual convergence.
- Lets SyncSpace focus on transport, auth, persistence, and observability instead of inventing a CRDT from scratch.

## Consequences

- SyncSpace must clearly distinguish Yjs functionality from project-owned synchronization infrastructure.
- Persistence and snapshotting need to preserve Yjs state faithfully.
