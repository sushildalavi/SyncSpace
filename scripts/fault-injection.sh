#!/usr/bin/env bash
# Starts a throwaway PostgreSQL and Redis plus two API instances, then runs apps/loadtest/src/faults.ts, which breaks
# them while clients are editing. Your development containers and data are not touched. Requires Docker and lsof.
# Usage: scripts/fault-injection.sh [--scenario redis|database|outage] [--outage SECONDS] [--no-sync-check]
set -euo pipefail
cd "$(dirname "$0")/.."
LOG_DIR="${TMPDIR:-/tmp}/syncspace-faults"; mkdir -p "$LOG_DIR"
PG=syncspace-faults-pg
REDIS=syncspace-faults-redis

pids=()
cleanup() {
  for p in ${pids[@]+"${pids[@]}"}; do pkill -P "$p" 2>/dev/null || true; kill "$p" 2>/dev/null || true; done
  lsof -ti tcp:3201 -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
  lsof -ti tcp:3202 -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
  docker rm -f -v "$PG" "$REDIS" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker rm -f -v "$PG" "$REDIS" >/dev/null 2>&1 || true
docker run -d --name "$PG" -p 127.0.0.1:55432:5432 -e POSTGRES_USER=syncspace -e POSTGRES_PASSWORD=syncspace \
  -e POSTGRES_DB=syncspace postgres:16-alpine >/dev/null
docker run -d --name "$REDIS" -p 127.0.0.1:56379:6379 redis:7-alpine >/dev/null
# -h 127.0.0.1: the image's temporary init server only listens on a socket, so wait for the real one.
until docker exec "$PG" pg_isready -h 127.0.0.1 -U syncspace >/dev/null 2>&1; do sleep 1; done

export NODE_ENV=production
export DATABASE_URL=postgres://syncspace:syncspace@localhost:55432/syncspace
export REDIS_URL=redis://localhost:56379
export BETTER_AUTH_SECRET=faults-only-secret-0123456789abcdef0123
export WEB_ORIGIN=http://localhost:3200
export TRUST_PROXY=1 REQUIRE_EMAIL_VERIFICATION=false

(cd apps/api && API_BASE_URL=http://localhost:3201 API_PORT=3201 npx tsx src/main.ts >"$LOG_DIR/api1.log" 2>&1) & pids+=($!)
until curl -sf localhost:3201/health >/dev/null; do sleep 0.5; done
(cd apps/api && API_BASE_URL=http://localhost:3202 API_PORT=3202 RUN_MIGRATIONS=false npx tsx src/main.ts >"$LOG_DIR/api2.log" 2>&1) & pids+=($!)
until curl -sf localhost:3202/health >/dev/null; do sleep 0.5; done

cd apps/loadtest
npx tsx src/faults.ts "$@"
