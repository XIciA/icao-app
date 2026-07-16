#!/bin/sh

set -eu

DESIGN_PUBLIC="/Users/zhouyide/Desktop/icao设计稿/public"
PORT="${ICAO_ASSET_PORT:-3100}"

if [ ! -d "$DESIGN_PUBLIC/question-bank-assets/audio" ]; then
  echo "Canonical audio directory not found: $DESIGN_PUBLIC/question-bank-assets/audio" >&2
  exit 1
fi

echo "Serving repository resources with canonical design fallback at http://0.0.0.0:$PORT"
ICAO_ASSET_PORT="$PORT" exec node "$(dirname "$0")/serve-design-assets.mjs"
