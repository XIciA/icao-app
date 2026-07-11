#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
AVD_NAME="${ICAO_ANDROID_AVD:-ICAO_API_36}"

exec "$SCRIPT_DIR/with-android-env.sh" "$HOME/Library/Android/sdk/emulator/emulator" "@$AVD_NAME" -no-metrics
