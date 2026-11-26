#!/usr/bin/env bash
# Checks a running deployment from the outside.
# Usage: scripts/checkDeployment.sh app.example.com api.example.com
# For a local rehearsal with Caddy's self-signed certificate, set INSECURE=1.
set -uo pipefail

if [ $# -ne 2 ]; then
  echo "usage: $0 APP_DOMAIN API_DOMAIN" >&2
  exit 2
fi

app="https://$1"
api="https://$2"
failed=0

request() {
  if [ "${INSECURE:-0}" = "1" ]; then
    curl -sS --max-time 15 -k "$@"
  else
    curl -sS --max-time 15 "$@"
  fi
}

check() {
  if [ "$2" = "0" ]; then
    echo "PASS  $1"
  else
    echo "FAIL  $1"
    failed=1
  fi
}

request "$api/health" | grep -q '"ok":true'
check "API reaches PostgreSQL and Redis" $?

[ "$(request -o /dev/null -w '%{http_code}' "$app/sign-in")" = "200" ]
check "web app serves the sign-in page" $?

request -D - -o /dev/null -H "Origin: $app" "$api/config" | grep -qi "^access-control-allow-origin: $app"
check "API allows the web app's origin" $?

status="$(request -o /dev/null -w '%{http_code}' -X POST -H 'Origin: https://attacker.invalid' \
  -H 'Content-Type: application/json' -d '{}' "$api/workspaces")"
[ "$status" = "403" ]
check "API refuses writes from other origins (got $status)" $?

status="$(request -o /dev/null -w '%{http_code}' "$api/me")"
[ "$status" = "401" ]
check "API requires sign-in (got $status)" $?

[ "$(request -o /dev/null -w '%{http_code}' "http://$1/")" = "308" ]
check "plain HTTP redirects to HTTPS" $?

request "$api/config"
echo
exit "$failed"
