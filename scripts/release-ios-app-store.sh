#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_ROOT"

node tools/check-mainline-release.mjs

if [ -n "$(git status --porcelain)" ]; then
  echo 'App Store submission requires the unchanged, clean TestFlight source tree.' >&2
  exit 1
fi

node docs/workstreams/app-store-1.0.0/materials/validate-final-fields.mjs --submission
node tools/critical-capability-release-evidence.mjs verify app-store ios

ARCHIVE_POINTER="$PROJECT_ROOT/.generated/last-testflight-archive.txt"
if [ ! -f "$ARCHIVE_POINTER" ]; then
  echo "The validated TestFlight archive pointer is missing: $ARCHIVE_POINTER" >&2
  exit 1
fi
ARCHIVE_PATH=$(sed -n '1p' "$ARCHIVE_POINTER")
ARCHIVE_INFO="$ARCHIVE_PATH/Info.plist"
if [ -z "$ARCHIVE_PATH" ] || [ ! -f "$ARCHIVE_INFO" ]; then
  echo 'The exact TestFlight archive is unavailable on this Mac.' >&2
  exit 1
fi

EXPECTED_BUNDLE_ID=$(node -p "require('./app.json').expo.ios.bundleIdentifier")
EXPECTED_BUILD=$(node -p "require('./app.json').expo.ios.buildNumber")
ARCHIVE_BUNDLE_ID=$(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleIdentifier' "$ARCHIVE_INFO")
ARCHIVE_BUILD=$(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleVersion' "$ARCHIVE_INFO")
if [ "$ARCHIVE_BUNDLE_ID" != "$EXPECTED_BUNDLE_ID" ] || [ "$ARCHIVE_BUILD" != "$EXPECTED_BUILD" ]; then
  echo 'The local TestFlight archive does not match the App Store build that passed real-device testing.' >&2
  exit 1
fi

echo 'App Store critical-capability submission gate passed.'
echo "Use the already uploaded TestFlight build $EXPECTED_BUILD in App Store Connect."
echo 'No build was created and no upload or store submission was performed.'
