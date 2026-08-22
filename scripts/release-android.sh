#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_ROOT"

node tools/check-mainline-release.mjs

if [ -n "$(git status --porcelain)" ]; then
  echo 'Android Release builds require a clean Git worktree.' >&2
  echo 'Commit or otherwise finish the current changes before building.' >&2
  exit 1
fi

echo 'Android release scope (local signed APK only):'
git status --short

pnpm release:materialize
node tools/create-release-manifest.mjs
pnpm check
node tools/critical-capability-release-evidence.mjs verify android android
node tools/audio-sensitive-fingerprint.mjs verify android
pnpm android:standalone

DISPLAY_VERSION=$(node -p "require('./.generated/release/current.json').displayVersion")
ANDROID_METADATA=".generated/releases/android/$DISPLAY_VERSION/android-release.json"
if [ ! -f "$ANDROID_METADATA" ]; then
  echo "Android Release metadata is missing: $ANDROID_METADATA" >&2
  exit 1
fi
APK_PATH=$(ANDROID_METADATA_PATH=$ANDROID_METADATA node -p \
  "require('./' + process.env.ANDROID_METADATA_PATH).apkPath")

echo "Android Release build completed locally: $APK_PATH"
echo 'No ECS deployment or public APK publishing was performed.'
