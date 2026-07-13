#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ECS_HOST=${ICAO_ECS_HOST:-47.109.132.161}
ECS_USER=${ICAO_ECS_USER:-root}
SSH_KEY=${ICAO_ECS_SSH_KEY:-$HOME/.ssh/icao_app_codex}
API_PORT=${ICAO_API_PORT:-3101}
SUPABASE_PORT=${ICAO_SUPABASE_PORT:-8000}
METRO_PORT=${ICAO_METRO_PORT:-8081}
MAILPIT_PORT=${ICAO_MAILPIT_PORT:-8025}
TUNNEL_PID=

cleanup() {
  if [ -n "$TUNNEL_PID" ] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT HUP INT TERM

if [ ! -r "$SSH_KEY" ]; then
  echo "Project SSH key is not readable: $SSH_KEY" >&2
  exit 1
fi

HOST_IP=${ICAO_HOST_IP:-$(ipconfig getifaddr en0 2>/dev/null || true)}
if [ -z "$HOST_IP" ]; then
  echo 'Unable to determine the Mac LAN IP. Set ICAO_HOST_IP explicitly.' >&2
  exit 1
fi

for port in "$API_PORT" "$SUPABASE_PORT" "$MAILPIT_PORT"; do
  if nc -z "$HOST_IP" "$port" >/dev/null 2>&1; then
    echo "Local endpoint $HOST_IP:$port is already in use. Stop the old tunnel first." >&2
    exit 1
  fi
done
if nc -z 127.0.0.1 "$METRO_PORT" >/dev/null 2>&1; then
  echo "Metro port $METRO_PORT is already in use. Stop the old pnpm ios/start process first." >&2
  exit 1
fi

echo "Connecting the iOS simulator to ECS through $HOST_IP..."
ssh -N \
  -i "$SSH_KEY" \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L "$HOST_IP:$API_PORT:127.0.0.1:3101" \
  -L "$HOST_IP:$SUPABASE_PORT:127.0.0.1:8000" \
  -L "127.0.0.1:$MAILPIT_PORT:127.0.0.1:8025" \
  "$ECS_USER@$ECS_HOST" &
TUNNEL_PID=$!

sleep 1
if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
  wait "$TUNNEL_PID" || true
  echo 'SSH tunnel failed to start.' >&2
  exit 1
fi

PUBLISHABLE_KEY=$(ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" \
  "sed -n 's/^SUPABASE_PUBLISHABLE_KEY=//p' /opt/icao/runtime/api/.env | head -1")
if [ -z "$PUBLISHABLE_KEY" ]; then
  echo 'Supabase publishable key is missing on the ECS.' >&2
  exit 1
fi

ready=0
attempt=0
while [ "$attempt" -lt 10 ]; do
  if curl -fsS --max-time 2 "http://$HOST_IP:$API_PORT/health/ready" >/dev/null 2>&1; then
    ready=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 0.5
done
if [ "$ready" -ne 1 ]; then
  echo 'ICAO API did not become ready through the SSH tunnel.' >&2
  exit 1
fi

export EXPO_PUBLIC_ICAO_API_URL="http://$HOST_IP:$API_PORT"
export EXPO_PUBLIC_SUPABASE_URL="http://$HOST_IP:$SUPABASE_PORT"
export EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY"

echo "API: $EXPO_PUBLIC_ICAO_API_URL"
echo "Supabase: $EXPO_PUBLIC_SUPABASE_URL"
echo "Mailpit: http://127.0.0.1:$MAILPIT_PORT"
echo 'The publishable key was loaded from ECS without writing it to the repository.'

cd "$PROJECT_ROOT"
if [ "${ICAO_PHASE2A_BUILD:-0}" = 1 ]; then
  pnpm exec expo run:ios --port "$METRO_PORT"
else
  pnpm exec expo start --dev-client --lan --port "$METRO_PORT" --ios
fi
