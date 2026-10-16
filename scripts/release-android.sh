#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_ROOT"

node tools/check-mainline-release.mjs

case "${1:-}" in
  --verify-acceptance)
    # Run after the candidate exists and the real device checks have been performed.
    # These commands verify actual evidence; they never create passed observations.
    node tools/critical-capability-release-evidence.mjs verify android android
    node tools/audio-sensitive-fingerprint.mjs verify android
    exit 0
    ;;
  '') ;;
  *) echo 'Usage: release-android.sh [--verify-acceptance]' >&2; exit 1 ;;
esac

if [ -n "$(git status --porcelain)" ]; then
  echo 'Android Release builds require a clean Git worktree.' >&2
  echo 'Commit or otherwise finish the current changes before building.' >&2
  exit 1
fi

echo 'Android candidate scope (local signed APK; real-device acceptance remains separate):'
git status --short

pnpm release:materialize
node tools/create-release-manifest.mjs
pnpm check
# A candidate must exist before it can be installed and accepted. Do not require
# Development Build or audio E2E evidence to produce that signed candidate.
pnpm android:standalone

DISPLAY_VERSION=$(node -p "require('./.generated/release/current.json').displayVersion")
CHANNEL=android
if [ "${ICAO_APP_VARIANT:-}" = "android-test" ]; then CHANNEL=android-test; fi
ANDROID_METADATA=".generated/releases/$CHANNEL/$DISPLAY_VERSION/android-release.json"
if [ ! -f "$ANDROID_METADATA" ]; then
  echo "Android Release metadata is missing: $ANDROID_METADATA" >&2
  exit 1
fi
APK_PATH=$(ANDROID_METADATA_PATH=$ANDROID_METADATA node -p \
  "require('./' + process.env.ANDROID_METADATA_PATH).apkPath")

ANDROID_METADATA_PATH=$ANDROID_METADATA node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const metadataPath = process.env.ANDROID_METADATA_PATH;
const candidate = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
fs.writeFileSync(path.join(path.dirname(metadataPath), 'acceptance-pending.json'), JSON.stringify({
  status: 'pending-real-device-acceptance',
  candidate,
  checks: [
    ...(candidate.packageName?.endsWith('.test')
      ? ['coinstall-with-official-package', 'phone-login-and-existing-membership', 'wechat-entry-unavailable-for-unregistered-test-package']
      : ['install-and-same-signature-upgrade', 'phone-and-wechat-login', 'wechat-payment-return-entitlement-and-refund']),
    'background-sequential-audio-and-lock-screen-controls',
    'microphone-permissions-recording-and-audio-routes',
    'ai-and-cross-platform-learning-sync',
  ],
  note: 'The signed candidate and code checks do not certify real-device or real-payment acceptance.',
}, null, 2) + '\n');
NODE

echo "Android Release build completed locally: $APK_PATH"
echo 'Real-device and real-payment acceptance is pending; see acceptance-pending.json beside the APK.'
echo 'No ECS deployment or public APK publishing was performed.'
