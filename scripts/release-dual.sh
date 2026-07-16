#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Android publishes first and is never rolled back merely because the later iOS
# device build is unavailable. The iOS command reuses the checked release state.
"$SCRIPT_DIR/release-android.sh"
ICAO_RELEASE_ALREADY_PREPARED=1 "$SCRIPT_DIR/release-ios.sh"

echo 'Android and iOS release commands both completed.'
