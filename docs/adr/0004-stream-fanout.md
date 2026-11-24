# ADR 0004: Redis Streams fan-out with XREAD

A shared consumer group delivers each entry to a single consumer, so with multiple API instances only one would forward an
update to its sockets. Each instance now reads the full stream with `XREAD` (no group). Document durability is in PostgreSQL,
so the stream can be lossy, and reconnecting clients resync from the database. Streams are kept over pub/sub for bounded
replay and visibility (`XLEN`, `XRANGE`).
