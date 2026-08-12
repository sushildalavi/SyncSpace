# Architecture Overview

SyncSpace uses a monorepo with a thin but deliberate split between product surfaces and shared collaboration logic.

## Runtime shape

- `apps/web` is the Next.js app router frontend.
- `apps/api` is the NestJS backend for auth, workspace CRUD, document metadata, and collaboration WebSockets.
- `packages/contracts` holds request and payload schemas shared by both apps.
- `packages/collaboration` holds Yjs helpers and collaboration utilities.
- `apps/loadtest` exercises the WebSocket collaboration path under configurable pressure.

## Data flow

1. A user signs in through the web app.
2. The web app stores the JWT locally and uses it for REST and WebSocket calls.
3. Workspace and document metadata comes from MongoDB.
4. Real-time edits flow through Yjs updates over WebSockets.
5. MongoDB stores durable documents, snapshots, and update history.
6. Redis Streams fan collaboration events across instances.
7. Presence lives in Redis and expires automatically.

## Why this shape

- MongoDB is the durable source of truth.
- Redis is only used for distribution and ephemeral state.
- Yjs handles convergence; SyncSpace handles auth, persistence, and transport.
- The frontend keeps collaborative state separate from server state and UI state.
