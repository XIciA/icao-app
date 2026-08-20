#!/bin/sh

set -eu

if [ "${EXPO_PUBLIC_ICAO_AUDIO_E2E:-0}" = '1' ]; then
  echo 'EXPO_PUBLIC_ICAO_AUDIO_E2E is forbidden in TestFlight builds.' >&2
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"
. "$SCRIPT_DIR/lib/ios-release-product.sh"

# The formal release entry prepares only the version/build files. Everything
# else must already be committed; this keeps the lower-level archive command
# from becoming a dirty-worktree escape hatch.
UNREVIEWED_CHANGES=$(git -C "$PROJECT_ROOT" status --porcelain --untracked-files=all -- \
  . \
  ':(exclude)app.json' \
  ':(exclude)src/config/app-version.ts' \
  ':(exclude)src/config/app-version.ios.ts' \
  ':(exclude)src/config/app-version.android.ts')
if [ -n "$UNREVIEWED_CHANGES" ]; then
  echo 'TestFlight archive inputs contain changes outside the prepared version/build files.' >&2
  echo 'Use pnpm release:ios:testflight from a clean reviewed worktree.' >&2
  exit 1
fi

IOS_SCHEME=${ICAO_IOS_SCHEME:-ICAO}
IOS_TEAM_ID=${ICAO_IOS_TEAM_ID:-3FX69S3S8P}
IOS_BUNDLE_ID=${ICAO_IOS_BUNDLE_ID:-com.readyoufife.ios}
IOS_PRODUCT_NAME=${ICAO_IOS_PRODUCT_NAME:-}
NODE_BINARY=${NODE_BINARY:-$(command -v node)}
MARKETING_VERSION=$($NODE_BINARY -p "require('$PROJECT_ROOT/app.json').expo.version")
IOS_BUILD_NUMBER=$($NODE_BINARY -p "require('$PROJECT_ROOT/app.json').expo.ios.buildNumber || '1'")
ARCHIVE_DATE=$(date '+%Y-%m-%d')
ARCHIVE_TIME=$(date '+%H.%M.%S')
ARCHIVE_PATH=${ICAO_IOS_ARCHIVE_PATH:-$HOME/Library/Developer/Xcode/Archives/$ARCHIVE_DATE/听你五个 $ARCHIVE_TIME.xcarchive}

require_command pnpm
require_command pod
require_command xcodebuild
require_command codesign
load_release_runtime

node tools/audio-sensitive-fingerprint.mjs verify ios
node tools/critical-capability-release-evidence.mjs verify testflight ios

echo 'Checking the public TestFlight runtime...'
check_release_runtime apple

export NODE_BINARY
echo "API: $EXPO_PUBLIC_ICAO_API_URL"
echo "Supabase: $EXPO_PUBLIC_SUPABASE_URL"
echo "iOS Bundle ID: $IOS_BUNDLE_ID"
echo "Apple Team ID: $IOS_TEAM_ID"
echo "Archive: $ARCHIVE_PATH"
echo 'The publishable key is available only to the build process and is not printed.'

cd "$PROJECT_ROOT"
ICAO_APP_VARIANT=production pnpm exec expo prebuild --platform ios --no-install
(
  cd "$PROJECT_ROOT/ios"
  pod install
)

mkdir -p "$(dirname -- "$ARCHIVE_PATH")"
xcodebuild \
  -workspace "$PROJECT_ROOT/ios/ICAO.xcworkspace" \
  -scheme "$IOS_SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="$IOS_TEAM_ID" \
  PRODUCT_BUNDLE_IDENTIFIER="$IOS_BUNDLE_ID" \
  MARKETING_VERSION="$MARKETING_VERSION" \
  CURRENT_PROJECT_VERSION="$IOS_BUILD_NUMBER" \
  archive

ARCHIVED_PRODUCTS="$ARCHIVE_PATH/Products/Applications"
APP_PATH=$(find_ios_release_app "$ARCHIVED_PRODUCTS" "$IOS_PRODUCT_NAME")
verify_ios_release_app \
  "$APP_PATH" \
  "$API_URL" \
  "$SUPABASE_URL" \
  "$IOS_BUNDLE_ID" \
  "$MARKETING_VERSION" \
  "$IOS_BUILD_NUMBER" \
  "$IOS_TEAM_ID"

ARCHIVE_INFO="$ARCHIVE_PATH/Info.plist"
if [ ! -f "$ARCHIVE_INFO" ]; then
  echo "The Xcode archive metadata is missing: $ARCHIVE_INFO" >&2
  exit 1
fi
ARCHIVE_BUNDLE_ID=$(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleIdentifier' "$ARCHIVE_INFO")
ARCHIVE_TEAM_ID=$(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:Team' "$ARCHIVE_INFO")
if [ "$ARCHIVE_BUNDLE_ID" != "$IOS_BUNDLE_ID" ] || [ "$ARCHIVE_TEAM_ID" != "$IOS_TEAM_ID" ]; then
  echo 'The Xcode archive metadata does not match the production app identity.' >&2
  exit 1
fi

mkdir -p "$PROJECT_ROOT/.generated"
printf '%s\n' "$ARCHIVE_PATH" > "$PROJECT_ROOT/.generated/last-testflight-archive.txt"
echo 'TestFlight archive and validation completed.'
echo "Open Xcode Organizer and upload: $ARCHIVE_PATH"
