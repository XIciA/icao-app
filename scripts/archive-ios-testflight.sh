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

node "$PROJECT_ROOT/tools/check-mainline-release.mjs" --root "$PROJECT_ROOT"

IOS_TEAM_ID=${ICAO_IOS_TEAM_ID:-3FX69S3S8P}
IOS_BUNDLE_ID=${ICAO_IOS_BUNDLE_ID:-com.readyoufife.ios}
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
cd "$PROJECT_ROOT"
pnpm check:audio
pnpm test:recording
pnpm typecheck
load_release_runtime

# TestFlight is the device acceptance environment; focused audio tests run above.
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
ICAO_APP_VARIANT=production pnpm exec expo prebuild --platform ios --clean --no-install
verify_ios_cng_brand_assets "$PROJECT_ROOT"
(
  cd "$PROJECT_ROOT/ios"
  pod install
)
check_wechat_candidate_configuration
configure_ios_cng_product "$PROJECT_ROOT/ios"
verify_ios_storekit_dependencies "$PROJECT_ROOT/ios/Podfile.lock"

mkdir -p "$(dirname -- "$ARCHIVE_PATH")"
xcodebuild \
  -workspace "$IOS_WORKSPACE" \
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
check_wechat_ios_artifact "$APP_PATH"

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
