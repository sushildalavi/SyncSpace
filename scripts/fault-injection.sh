#!/usr/bin/env bash
# Starts two API instances, then runs apps/loadtest/src/faults.ts, which pauses/restarts Redis and kills one instance
# while clients are editing. Requires: docker compose (postgres + redis running), lsof.
# Usage: scripts/fault-injection.sh [--no-sync-check] [other faults.ts args]
set -euo pipefail
cd "$(dirname "$0")/.."
LOG_DIR="${TMPDIR:-/tmp}/syncspace-faults"; mkdir -p "$LOG_DIR"

docker compose up -d postgres redis >/dev/null
until docker compose exec -T postgres pg_isready -U syncspace >/dev/null 2>&1; do sleep 1; done
docker compose exec -T postgres psql -U syncspace -d postgres -q -c "drop database if exists syncspace_faults with (force)" -c "create database syncspace_faults"

export NODE_ENV=production
export DATABASE_URL=postgres://syncspace:syncspace@localhost:5432/syncspace_faults
export REDIS_URL=redis://localhost:6379/4
export BETTER_AUTH_SECRET=faults-only-secret-0123456789abcdef0123
export WEB_ORIGIN=http://localhost:3200
export TRUST_PROXY=1 REQUIRE_EMAIL_VERIFICATION=false

pids=()
cleanup() {
  for p in "${pids[@]}"; do pkill -P "$p" 2>/dev/null || true; kill "$p" 2>/dev/null || true; done
  lsof -ti tcp:3201 -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
  lsof -ti tcp:3202 -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
  docker compose unpause redis >/dev/null 2>&1 || true
}
trap cleanup EXIT

(cd apps/api && API_BASE_URL=http://localhost:3201 API_PORT=3201 npx tsx src/main.ts >"$LOG_DIR/api1.log" 2>&1) & pids+=($!)
until curl -sf localhost:3201/health >/dev/null; do sleep 0.5; done
(cd apps/api && API_BASE_URL=http://localhost:3202 API_PORT=3202 RUN_MIGRATIONS=false npx tsx src/main.ts >"$LOG_DIR/api2.log" 2>&1) & pids+=($!)
until curl -sf localhost:3202/health >/dev/null; do sleep 0.5; done

cd apps/loadtest
npx tsx src/faults.ts "$@"
