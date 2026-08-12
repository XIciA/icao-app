#!/bin/sh

set -eu

PLATFORM=${1:-}
case "$PLATFORM" in
  ios) APP_ID=com.readyoufife.ios ;;
  android) APP_ID=com.readyoufife.app ;;
  *) echo 'Usage: run-audio-e2e.sh <ios|android>' >&2; exit 2 ;;
esac

if ! command -v maestro >/dev/null 2>&1; then
  echo 'Maestro is required: https://docs.maestro.dev/getting-started/installing-maestro' >&2
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PORT=${ICAO_AUDIO_E2E_METRO_PORT:-8081}
LOG_DIR="$PROJECT_ROOT/.generated/audio-e2e"
mkdir -p "$LOG_DIR"

cd "$PROJECT_ROOT"
CI=1 EXPO_PUBLIC_ICAO_AUDIO_E2E=1 pnpm exec expo start --dev-client --port "$PORT" >"$LOG_DIR/metro-$PLATFORM.log" 2>&1 &
METRO_PID=$!
trap 'kill "$METRO_PID" 2>/dev/null || true' EXIT HUP INT TERM

attempt=0
until curl -fsS "http://127.0.0.1:$PORT/status" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 45 ]; then
    echo "Metro did not become ready; inspect $LOG_DIR/metro-$PLATFORM.log" >&2
    exit 1
  fi
  sleep 1
done

maestro test -e APP_ID="$APP_ID" .maestro/audio-recording-flow.yaml
node tools/audio-sensitive-fingerprint.mjs write "$PLATFORM"
