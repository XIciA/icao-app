#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_ROOT"

if [ "${ICAO_RELEASE_ALREADY_PREPARED:-0}" != '1' ]; then
  if [ -n "$(git status --porcelain)" ]; then
    echo 'pnpm release:ios requires a clean Git worktree.' >&2
    exit 1
  fi
  pnpm release:prepare
  node tools/create-release-manifest.mjs
  pnpm check
fi

node tools/audio-sensitive-fingerprint.mjs verify ios
pnpm ios:standalone
echo 'iOS release build and device installation completed independently of Android.'
