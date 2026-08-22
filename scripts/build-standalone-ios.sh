#!/bin/sh

set -eu

if [ "${EXPO_PUBLIC_ICAO_AUDIO_E2E:-0}" = '1' ]; then
  echo 'EXPO_PUBLIC_ICAO_AUDIO_E2E is forbidden in iOS Release builds.' >&2
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"
. "$SCRIPT_DIR/lib/ios-release-product.sh"
node "$PROJECT_ROOT/tools/check-mainline-release.mjs" --root "$PROJECT_ROOT"
IOS_DEVICE=${ICAO_IOS_DEVICE:-OOMG}
IOS_DEVICE_ID=${ICAO_IOS_DEVICE_ID:-00008150-0011395A3638401C}
IOS_SCHEME=${ICAO_IOS_SCHEME:-ICAO}
IOS_TEAM_ID=${ICAO_IOS_TEAM_ID:-3FX69S3S8P}
IOS_PRODUCT_NAME=${ICAO_IOS_PRODUCT_NAME:-}
IOS_BUNDLE_ID=${ICAO_IOS_BUNDLE_ID:-com.readyoufife.ios}
DERIVED_DATA=${ICAO_IOS_DERIVED_DATA:-$HOME/Library/Developer/Xcode/DerivedData/ICAO-Standalone}
NODE_BINARY=${NODE_BINARY:-$(command -v node)}
MARKETING_VERSION=$(node -p "require('$PROJECT_ROOT/app.json').expo.version")
IOS_BUILD_NUMBER=$(node -p "require('$PROJECT_ROOT/app.json').expo.ios.buildNumber || '1'")
load_release_runtime

echo 'Checking the public standalone runtime...'
check_release_runtime apple
export NODE_BINARY

echo "API: $EXPO_PUBLIC_ICAO_API_URL"
echo "Supabase: $EXPO_PUBLIC_SUPABASE_URL"
echo "iOS device: $IOS_DEVICE"
echo 'The publishable key is available only to the build process and is not printed.'
echo 'Building and installing an iOS Release app with its JavaScript bundle embedded...'

cd "$PROJECT_ROOT"
ICAO_APP_VARIANT=production pnpm exec expo prebuild --platform ios --no-install
(
  cd "$PROJECT_ROOT/ios"
  pod install
)
xcodebuild \
  -workspace "$PROJECT_ROOT/ios/ICAO.xcworkspace" \
  -scheme "$IOS_SCHEME" \
  -configuration Release \
  -destination "id=$IOS_DEVICE_ID" \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="$IOS_TEAM_ID" \
  MARKETING_VERSION="$MARKETING_VERSION" \
  CURRENT_PROJECT_VERSION="$IOS_BUILD_NUMBER" \
  build

PRODUCT_DIR="$DERIVED_DATA/Build/Products/Release-iphoneos"
APP_PATH=$(find_ios_release_app "$PRODUCT_DIR" "$IOS_PRODUCT_NAME")
verify_ios_release_app \
  "$APP_PATH" \
  "$API_URL" \
  "$SUPABASE_URL" \
  "$IOS_BUNDLE_ID" \
  "$MARKETING_VERSION" \
  "$IOS_BUILD_NUMBER" \
  "$IOS_TEAM_ID"
xcrun devicectl device install app --device "$IOS_DEVICE" "$APP_PATH"
if ! xcrun devicectl device process launch --device "$IOS_DEVICE" "$IOS_BUNDLE_ID"; then
  echo 'The Release app was installed but iOS did not allow it to launch.' >&2
  echo 'On the iPhone, trust the developer under Settings > General > VPN & Device Management, then launch again.' >&2
  exit 1
fi

echo 'Standalone iOS Release build, validation, installation, and launch completed.'
