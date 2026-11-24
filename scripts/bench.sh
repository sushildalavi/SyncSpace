#!/usr/bin/env bash
# Starts two API instances against a fresh database and runs the collaboration load test.
# Requires: docker compose up -d postgres redis   (and node_modules installed)
# Usage: scripts/bench.sh [loadtest args...]
set -euo pipefail
cd "$(dirname "$0")/.."
LOG_DIR="${TMPDIR:-/tmp}/syncspace-bench"; mkdir -p "$LOG_DIR"

docker compose exec -T postgres psql -U syncspace -d postgres -q -c "drop database if exists syncspace_bench with (force)" -c "create database syncspace_bench"

export NODE_ENV=production
export DATABASE_URL=postgres://syncspace:syncspace@localhost:5432/syncspace_bench
export REDIS_URL=redis://localhost:6379/3
export BETTER_AUTH_SECRET=bench-only-secret-0123456789abcdef0123
export WEB_ORIGIN=http://localhost:3200
export TRUST_PROXY=1 REQUIRE_EMAIL_VERIFICATION=false

pids=()
cleanup() { for p in "${pids[@]}"; do pkill -P "$p" 2>/dev/null || true; kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

(cd apps/api && API_BASE_URL=http://localhost:3201 API_PORT=3201 npx tsx src/main.ts >"$LOG_DIR/api1.log" 2>&1) & pids+=($!)
until curl -sf localhost:3201/health >/dev/null; do sleep 0.5; done
(cd apps/api && API_BASE_URL=http://localhost:3202 API_PORT=3202 RUN_MIGRATIONS=false npx tsx src/main.ts >"$LOG_DIR/api2.log" 2>&1) & pids+=($!)
until curl -sf localhost:3202/health >/dev/null; do sleep 0.5; done

cd apps/loadtest
npx tsx src/main.ts --apis http://localhost:3201,http://localhost:3202 --origin http://localhost:3200 "$@"
