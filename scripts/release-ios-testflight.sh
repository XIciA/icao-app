#!/usr/bin/env bash

set -euo pipefail

if [ "${EXPO_PUBLIC_ICAO_AUDIO_E2E:-0}" = '1' ]; then
  echo 'EXPO_PUBLIC_ICAO_AUDIO_E2E is forbidden in TestFlight builds.' >&2
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"
. "$SCRIPT_DIR/lib/ios-release-product.sh"
cd "$PROJECT_ROOT"

node tools/check-mainline-release.mjs

if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  echo 'TestFlight release requires a clean, reviewed Git worktree.' >&2
  exit 1
fi

TESTFLIGHT_CONFIG=${ICAO_TESTFLIGHT_CONFIG:-${HOME:?}/.config/icao-app/testflight.env}
if [ ! -r "$TESTFLIGHT_CONFIG" ]; then
  echo "Missing App Store Connect config: $TESTFLIGHT_CONFIG" >&2
  exit 1
fi
CONFIG_MODE=$(stat -f '%Lp' "$TESTFLIGHT_CONFIG")
if [ "$CONFIG_MODE" != '600' ]; then
  echo 'App Store Connect config permissions must be 0600.' >&2
  exit 1
fi
set -a
. "$TESTFLIGHT_CONFIG"
set +a
: "${APP_STORE_CONNECT_KEY_ID:?Missing APP_STORE_CONNECT_KEY_ID}"
: "${APP_STORE_CONNECT_ISSUER_ID:?Missing APP_STORE_CONNECT_ISSUER_ID}"
APP_STORE_CONNECT_KEY_PATH=${APP_STORE_CONNECT_KEY_PATH:-${HOME:?}/.appstoreconnect/private_keys/AuthKey_${APP_STORE_CONNECT_KEY_ID}.p8}
case "$APP_STORE_CONNECT_KEY_PATH" in
  '~/'*) APP_STORE_CONNECT_KEY_PATH=${HOME:?}/${APP_STORE_CONNECT_KEY_PATH#\~/} ;;
esac
PRIVATE_KEY_DIRECTORY=${HOME:?}/.appstoreconnect/private_keys
case "$APP_STORE_CONNECT_KEY_PATH" in
  "$PRIVATE_KEY_DIRECTORY"/*.p8) ;;
  *) echo 'The App Store Connect private key must be a .p8 file under ~/.appstoreconnect/private_keys/.' >&2; exit 1 ;;
esac
if [ ! -r "$APP_STORE_CONNECT_KEY_PATH" ]; then
  echo 'The configured App Store Connect private key is not readable.' >&2
  exit 1
fi
KEY_MODE=$(stat -f '%Lp' "$APP_STORE_CONNECT_KEY_PATH")
if [ "$KEY_MODE" != '600' ]; then
  echo 'App Store Connect private-key permissions must be 0600.' >&2
  exit 1
fi

redact_asc_output() {
  sed \
    -e "s/${APP_STORE_CONNECT_KEY_ID}/[redacted-key-id]/g" \
    -e "s/${APP_STORE_CONNECT_ISSUER_ID}/[redacted-issuer-id]/g"
}

require_command pnpm
require_command pod
require_command xcodebuild
require_command codesign
require_command plutil
require_command xcrun

pnpm check:audio
pnpm test:recording
pnpm typecheck
pnpm check:ios:testflight
git diff --check
# TestFlight is the device acceptance environment; focused audio tests run above.
node tools/critical-capability-release-evidence.mjs verify testflight ios
node tools/app-store-connect-testflight.mjs verify-build

load_release_runtime
check_release_runtime apple

IOS_TEAM_ID=${ICAO_IOS_TEAM_ID:-3FX69S3S8P}
IOS_BUNDLE_ID=${ICAO_IOS_BUNDLE_ID:-com.readyoufife.ios}
MARKETING_VERSION=$(node -p "require('$PROJECT_ROOT/app.json').expo.version")
IOS_BUILD_NUMBER=$(node -p "require('$PROJECT_ROOT/app.json').expo.ios.buildNumber")
ARCHIVE_ROOT=${ICAO_TESTFLIGHT_OUTPUT_ROOT:-$PROJECT_ROOT/.generated/testflight}
CANDIDATE_STAMP=$(date -u '+%Y%m%dT%H%M%SZ')
ARCHIVE_PATH=$ARCHIVE_ROOT/ICAO-${IOS_BUILD_NUMBER}-${CANDIDATE_STAMP}.xcarchive
EXPORT_PATH=$ARCHIVE_ROOT/export-${IOS_BUILD_NUMBER}-${CANDIDATE_STAMP}
EXPORT_OPTIONS=$ARCHIVE_ROOT/ExportOptions-${IOS_BUILD_NUMBER}-${CANDIDATE_STAMP}.plist
ARCHIVE_AUDIT_PATH=$ARCHIVE_ROOT/archive-audit-${IOS_BUILD_NUMBER}-${CANDIDATE_STAMP}.json

mkdir -p "$ARCHIVE_ROOT" "$EXPORT_PATH"
plutil -create xml1 "$EXPORT_OPTIONS"
plutil -insert method -string app-store-connect "$EXPORT_OPTIONS"
plutil -insert destination -string export "$EXPORT_OPTIONS"
plutil -insert signingStyle -string automatic "$EXPORT_OPTIONS"
plutil -insert teamID -string "$IOS_TEAM_ID" "$EXPORT_OPTIONS"
plutil -insert uploadSymbols -bool YES "$EXPORT_OPTIONS"

export NODE_BINARY=${NODE_BINARY:-$(command -v node)}
ICAO_APP_VARIANT=production pnpm exec expo prebuild --platform ios --clean --no-install
verify_ios_cng_brand_assets "$PROJECT_ROOT"
(
  cd "$PROJECT_ROOT/ios"
  pod install
)
check_wechat_candidate_configuration
configure_ios_cng_product "$PROJECT_ROOT/ios"
verify_ios_storekit_dependencies "$PROJECT_ROOT/ios/Podfile.lock"

xcodebuild \
  -workspace "$IOS_WORKSPACE" \
  -scheme "$IOS_SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$APP_STORE_CONNECT_KEY_PATH" \
  -authenticationKeyID "$APP_STORE_CONNECT_KEY_ID" \
  -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID" \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="$IOS_TEAM_ID" \
  PRODUCT_BUNDLE_IDENTIFIER="$IOS_BUNDLE_ID" \
  MARKETING_VERSION="$MARKETING_VERSION" \
  CURRENT_PROJECT_VERSION="$IOS_BUILD_NUMBER" \
  archive 2>&1 | redact_asc_output

APP_PATH=$(find_ios_release_app "$ARCHIVE_PATH/Products/Applications" "$IOS_PRODUCT_NAME")
verify_ios_release_app \
  "$APP_PATH" \
  "$API_URL" \
  "$SUPABASE_URL" \
  "$IOS_BUNDLE_ID" \
  "$MARKETING_VERSION" \
  "$IOS_BUILD_NUMBER" \
  "$IOS_TEAM_ID"
INFO_PLIST=$APP_PATH/Info.plist
read_plist() { /usr/libexec/PlistBuddy -c "Print :$1" "$INFO_PLIST" 2>/dev/null || true; }
if [ "$(read_plist CFBundleIdentifier)" != "$IOS_BUNDLE_ID" ] \
  || [ "$(read_plist CFBundleShortVersionString)" != "$MARKETING_VERSION" ] \
  || [ "$(read_plist CFBundleVersion)" != "$IOS_BUILD_NUMBER" ]; then
  echo 'Archived Bundle ID or version does not match the TestFlight candidate.' >&2
  exit 1
fi
if [ -z "$(read_plist NSMicrophoneUsageDescription)" ]; then
  echo 'Archived app is missing NSMicrophoneUsageDescription.' >&2
  exit 1
fi
if /usr/libexec/PlistBuddy -c 'Print :NSBonjourServices' "$INFO_PLIST" 2>/dev/null | grep -Fq '_expo._tcp'; then
  echo 'Archived app still contains the Expo Dev Launcher Bonjour service.' >&2
  exit 1
fi
if read_plist NSLocalNetworkUsageDescription | grep -Fq 'Expo Dev Launcher'; then
  echo 'Archived app still contains the Expo Dev Launcher local-network disclosure.' >&2
  exit 1
fi
if find "$APP_PATH" -type d \( -name EXDevLauncher.bundle -o -name EXDevMenu.bundle \) -print -quit | grep -q .; then
  echo 'Archived app still contains Expo development resources.' >&2
  exit 1
fi
if ! grep -aFq "$API_URL" "$APP_PATH/main.jsbundle" || ! grep -aFq "$SUPABASE_URL" "$APP_PATH/main.jsbundle"; then
  echo 'Archived JavaScript bundle does not contain the production runtime URLs.' >&2
  exit 1
fi
if grep -aEq '127\.0\.0\.1:(3101|8000)|https?://(10\.[0-9.]+|192\.168\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+)' "$APP_PATH/main.jsbundle"; then
  echo 'Archived JavaScript bundle contains a local development address.' >&2
  exit 1
fi
codesign --verify --deep --strict "$APP_PATH"
node tools/audit-ios-archive.mjs "$APP_PATH" "$ARCHIVE_AUDIT_PATH"
check_wechat_ios_artifact "$APP_PATH"

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$APP_STORE_CONNECT_KEY_PATH" \
  -authenticationKeyID "$APP_STORE_CONNECT_KEY_ID" \
  -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID" \
  2>&1 | redact_asc_output

IPA_PATH=$(find "$EXPORT_PATH" -maxdepth 1 -type f -name '*.ipa' -print -quit)
if [ -z "$IPA_PATH" ]; then
  echo 'The exported TestFlight IPA was not found.' >&2
  exit 1
fi
node tools/create-testflight-candidate.mjs "$ARCHIVE_PATH" "$IPA_PATH" "$ARCHIVE_AUDIT_PATH"

xcrun altool --validate-app "$IPA_PATH" --type ios \
  --api-key "$APP_STORE_CONNECT_KEY_ID" \
  --api-issuer "$APP_STORE_CONNECT_ISSUER_ID" \
  --p8-file-path "$APP_STORE_CONNECT_KEY_PATH" \
  2>&1 | redact_asc_output
xcrun altool --upload-app -f "$IPA_PATH" --type ios --wait \
  --api-key "$APP_STORE_CONNECT_KEY_ID" \
  --api-issuer "$APP_STORE_CONNECT_ISSUER_ID" \
  --p8-file-path "$APP_STORE_CONNECT_KEY_PATH" \
  2>&1 | redact_asc_output

node tools/app-store-connect-testflight.mjs assign-groups
printf '%s\n' "$ARCHIVE_PATH" > "$PROJECT_ROOT/.generated/last-testflight-archive.txt"
printf '%s\n' "$IPA_PATH" > "$PROJECT_ROOT/.generated/last-testflight-ipa.txt"
echo "TestFlight build $IOS_BUILD_NUMBER uploaded and assigned to existing internal groups."
