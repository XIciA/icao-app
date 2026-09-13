#!/bin/sh
# Local entry, no browser credentials. The API connects through the protected SSH identity.
set -eu
cd "$(dirname "$0")/.."
if curl -fsS http://127.0.0.1:4173/ >/dev/null 2>&1; then
  open -a Safari http://127.0.0.1:4173/
  exit 0
fi
if [ ! -f apps/ops/dist/index.html ] || [ ! -f services/api/dist-ops/main-local-ops.js ]; then
  pnpm --filter @icao/contracts build
  pnpm --filter @icao/ops build
  pnpm --filter @icao/api build:ops
fi
node services/api/dist-ops/main-local-ops.js &
ops_pid=$!
trap 'kill "$ops_pid" 2>/dev/null || true' EXIT INT TERM
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4173/ >/dev/null 2>&1; then open -a Safari http://127.0.0.1:4173/; break; fi
  kill -0 "$ops_pid" 2>/dev/null || exit 1
  sleep 1
done
wait "$ops_pid"
