#!/bin/sh

set -eu

if [ "${EXPO_PUBLIC_ICAO_AUDIO_E2E:-0}" = '1' ]; then
  echo 'EXPO_PUBLIC_ICAO_AUDIO_E2E is forbidden in Android Release builds.' >&2
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"
. "$SCRIPT_DIR/lib/android-signing.sh"

load_release_runtime
check_release_runtime
load_android_release_signing
export NODE_ENV=production

if [ ! -f "$PROJECT_ROOT/.generated/release/current.json" ]; then
  echo 'Release metadata is missing; run pnpm release:prepare first.' >&2
  exit 1
fi

DISPLAY_VERSION=$(node -p "require('$PROJECT_ROOT/.generated/release/current.json').displayVersion")
EXPECTED_VERSION_CODE=$(node -p "require('$PROJECT_ROOT/.generated/release/current.json').versionCode")
EXPECTED_PACKAGE=$(node -p "require('$PROJECT_ROOT/.generated/release/current.json').androidPackage")
ANDROID_HOME=${ANDROID_HOME:-${HOME:?}/Library/Android/sdk}
APKSIGNER=${ICAO_APKSIGNER:-$(find "$ANDROID_HOME/build-tools" -type f -name apksigner | sort | tail -1)}
APKANALYZER=${ICAO_APKANALYZER:-$ANDROID_HOME/cmdline-tools/latest/bin/apkanalyzer}

if [ ! -x "$APKSIGNER" ] || [ ! -x "$APKANALYZER" ]; then
  echo 'Android APK verification tools are missing.' >&2
  exit 1
fi

echo 'Generating the Android native project from the checked Expo configuration...'
cd "$PROJECT_ROOT"
if [ "${ICAO_ANDROID_CLEAN_PREBUILD:-0}" = '1' ]; then
  ./scripts/with-android-env.sh pnpm exec expo prebuild --platform android --clean --no-install
else
  ./scripts/with-android-env.sh pnpm exec expo prebuild --platform android --no-install
fi

echo 'Building the signed Android Release APK...'
cd "$PROJECT_ROOT/android"
../scripts/with-android-env.sh ./gradlew :app:assembleRelease --no-daemon

SOURCE_APK=$PROJECT_ROOT/android/app/build/outputs/apk/release/app-release.apk
if [ ! -f "$SOURCE_APK" ]; then
  echo "Release APK is missing: $SOURCE_APK" >&2
  exit 1
fi

PACKAGE_ID=$($APKANALYZER manifest application-id "$SOURCE_APK")
VERSION_CODE=$($APKANALYZER manifest version-code "$SOURCE_APK")
if [ "$PACKAGE_ID" != "$EXPECTED_PACKAGE" ]; then
  echo "Unexpected Android package: $PACKAGE_ID" >&2
  exit 1
fi
if [ "$VERSION_CODE" != "$EXPECTED_VERSION_CODE" ]; then
  echo "Unexpected Android versionCode: $VERSION_CODE" >&2
  exit 1
fi

SIGNATURE_REPORT=$($APKSIGNER verify --verbose --print-certs "$SOURCE_APK")
printf '%s\n' "$SIGNATURE_REPORT" | grep -q 'Verified using v2 scheme (APK Signature Scheme v2): true'
if printf '%s\n' "$SIGNATURE_REPORT" | grep -qi 'Android Debug'; then
  echo 'The Release APK was signed with the Android debug certificate.' >&2
  exit 1
fi

BUNDLE_PATH=$(unzip -Z1 "$SOURCE_APK" | grep -E '(^|/)index\.android\.bundle$' | head -1)
if [ -z "$BUNDLE_PATH" ]; then
  echo 'The embedded Android JavaScript bundle is missing.' >&2
  exit 1
fi
TMP_BUNDLE=$(mktemp)
trap 'rm -f "$TMP_BUNDLE"' EXIT HUP INT TERM
unzip -p "$SOURCE_APK" "$BUNDLE_PATH" > "$TMP_BUNDLE"
grep -aFq "$API_URL" "$TMP_BUNDLE"
grep -aFq "$SUPABASE_URL" "$TMP_BUNDLE"
if grep -aEq '127\.0\.0\.1:(3101|8000)|https?://(10\.[0-9.]+|192\.168\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+)' "$TMP_BUNDLE"; then
  echo 'The Android Release bundle contains a loopback or private-LAN service URL.' >&2
  exit 1
fi

OUTPUT_DIR=$PROJECT_ROOT/.generated/releases/android/$DISPLAY_VERSION
mkdir -p "$OUTPUT_DIR"
OUTPUT_APK=$OUTPUT_DIR/feizhu-icao-$DISPLAY_VERSION.apk
cp "$SOURCE_APK" "$OUTPUT_APK"
SHA256=$(shasum -a 256 "$OUTPUT_APK" | awk '{print $1}')
printf '%s  %s\n' "$SHA256" "$(basename "$OUTPUT_APK")" > "$OUTPUT_APK.sha256"
printf '%s\n' "$SIGNATURE_REPORT" > "$OUTPUT_DIR/signature.txt"

cd "$PROJECT_ROOT"
APK_PATH=$OUTPUT_APK APK_SHA256=$SHA256 APK_PACKAGE=$PACKAGE_ID APK_VERSION_CODE=$VERSION_CODE \
  node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const current = JSON.parse(fs.readFileSync('.generated/release/current.json', 'utf8'));
const bytes = fs.statSync(process.env.APK_PATH).size;
const metadata = {
  ...current,
  apkPath: process.env.APK_PATH,
  apkFileName: path.basename(process.env.APK_PATH),
  sha256: process.env.APK_SHA256,
  packageName: process.env.APK_PACKAGE,
  versionCode: Number(process.env.APK_VERSION_CODE),
  fileSizeBytes: bytes,
  fileSizeDisplay: `${(bytes / 1024 / 1024).toFixed(1)} MB`,
};
fs.writeFileSync(path.join(path.dirname(process.env.APK_PATH), 'android-release.json'), `${JSON.stringify(metadata, null, 2)}\n`);
NODE

echo "Android Release verified: $OUTPUT_APK"
echo "Package: $PACKAGE_ID"
echo "versionCode: $VERSION_CODE"
echo "SHA-256: $SHA256"
