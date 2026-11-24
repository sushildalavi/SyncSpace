# ADR 0003: Better Auth replaces custom JWT handling

**Context.** Tokens in localStorage and in WebSocket URLs, no revocation, bcrypt, no OAuth.
**Decision.** Better Auth (database sessions, HttpOnly cookies, email verification/reset, Google social login, account linking,
rate limiting) with the Drizzle adapter. It runs as an Express handler inside Nest (`toNodeHandler`, registered before the
body parser), and Nest guards call `auth.api.getSession` on every request, so there is one session system and no parallel JWT code.
Compatibility checked against Nest 11/Express 5, Node 22–26 and drizzle-orm 0.45.
**Choices.** Argon2id (OWASP parameters) via `@node-rs/argon2`. Legacy bcrypt hashes are verified and upgraded on login.
`disableImplicitLinking` so email equality never merges identities. Provider tokens are stripped by a database hook.
**Not used.** The cookie cache (it would delay revocation).
