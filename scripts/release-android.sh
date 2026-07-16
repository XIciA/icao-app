#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_ROOT"

PREVIOUS_VERSION=$(mktemp)
trap 'rm -f "$PREVIOUS_VERSION"' EXIT HUP INT TERM
HAS_PREVIOUS=0
ECS_HOST=${ICAO_ECS_HOST:-47.109.132.161}
ECS_USER=${ICAO_ECS_USER:-root}
SSH_KEY=${ICAO_ECS_SSH_KEY:-${HOME:?}/.ssh/icao_app_codex}
if ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" \
  'test -f /opt/icao/runtime/downloads/android/version.json && cat /opt/icao/runtime/downloads/android/version.json' \
  >"$PREVIOUS_VERSION" 2>/dev/null; then
  HAS_PREVIOUS=1
fi

if [ "$HAS_PREVIOUS" -eq 1 ] && [ -n "$(git status --porcelain)" ]; then
  echo 'A previous public APK exists. Future pnpm release:android runs require a clean Git worktree.' >&2
  echo 'Commit or otherwise finish the current changes before publishing.' >&2
  exit 1
fi

if [ "$HAS_PREVIOUS" -eq 0 ]; then
  echo 'First Android release: the current dirty worktree is authorized and will be fully hashed.'
else
  echo 'Existing Android release detected; the clean-worktree gate passed.'
fi

echo 'Android release scope:'
git status --short

pnpm release:prepare
node tools/create-release-manifest.mjs
pnpm check
node tools/audio-sensitive-fingerprint.mjs verify android

CURRENT_API_FINGERPRINT=$(node -p "require('./.generated/release/current-manifest.json').apiFingerprint")
DEPLOY_API=0
if [ "$HAS_PREVIOUS" -eq 1 ]; then
  PREVIOUS_API_FINGERPRINT=$(PREVIOUS_VERSION_PATH=$PREVIOUS_VERSION node -p \
    "require(process.env.PREVIOUS_VERSION_PATH).apiFingerprint || ''")
  if [ "$CURRENT_API_FINGERPRINT" != "$PREVIOUS_API_FINGERPRINT" ]; then DEPLOY_API=1; fi
elif [ -n "$(git status --porcelain -- services/api packages/contracts content/vocabulary infra/api)" ]; then
  DEPLOY_API=1
fi

if [ "$DEPLOY_API" -eq 1 ]; then
  if [ "$HAS_PREVIOUS" -eq 1 ]; then
    PREVIOUS_HEAD=$(PREVIOUS_VERSION_PATH=$PREVIOUS_VERSION node -p "require(process.env.PREVIOUS_VERSION_PATH).gitHead || ''")
    if [ -n "$PREVIOUS_HEAD" ] && git cat-file -e "$PREVIOUS_HEAD^{commit}" 2>/dev/null && \
      [ -n "$(git diff --name-only "$PREVIOUS_HEAD" HEAD -- services/api/drizzle)" ]; then
      echo 'Database migration files changed. Android release stops before deployment for migration review.' >&2
      exit 1
    fi
  fi
  ./scripts/deploy-api-release.sh
else
  echo 'No API runtime change detected; ECS API deployment is skipped.'
fi

pnpm android:standalone
./scripts/publish-android-release.sh

echo 'Android release completed independently of iOS.'
