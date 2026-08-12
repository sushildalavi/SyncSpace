# WebSocket Events

## Client to server

- `document.update`
- `presence.update`

## Server to client

- `document.snapshot`
- `document.update`
- `document.duplicate`
- `presence.update`
- `error`

## Event rules

- Every collaboration payload carries stable identity.
- Duplicate or replayed updates must be ignored by MongoDB uniqueness checks and server-side dedupe logic.
- Presence messages are ephemeral and should never be persisted as document history.
