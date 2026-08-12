# Testing Strategy

## Unit tests

- Collaboration helpers
- Deduplication logic
- Snapshot policy
- Offline queue helpers

## Integration tests

- MongoDB persistence
- Redis Streams fan-out
- REST authentication and workspace access
- WebSocket lifecycle

## End-to-end tests

- Two browser sessions editing the same document
- Offline disconnect and reconnect behavior
- Unauthorized access rejection

## Load testing

- Simulated concurrent WebSocket clients
- Configurable documents and edit rates
- Disconnect and reconnect cycles
