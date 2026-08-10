#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Android builds first. The later iOS device build reuses the checked release
# state; neither command publishes an APK website or deploys the ECS API.
"$SCRIPT_DIR/release-android.sh"
ICAO_RELEASE_ALREADY_PREPARED=1 "$SCRIPT_DIR/release-ios.sh"

echo 'Android and iOS release commands both completed.'
