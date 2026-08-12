# Failure Modes

## WebSocket disconnects

- The client treats the socket as reconnectable.
- Pending messages can be queued in IndexedDB.

## Duplicate delivery

- MongoDB unique indexes protect update identity.
- The server returns a duplicate acknowledgment instead of reapplying state.

## Redis outage

- Durable document persistence still succeeds when MongoDB is healthy.
- Cross-instance fan-out and presence degrade gracefully.

## MongoDB outage

- Collaboration persistence fails closed.
- The client can still hold local edits until reconnect.

## Unauthorized access

- REST and WebSocket paths enforce workspace membership server-side.
- Frontend role claims are never trusted on their own.
