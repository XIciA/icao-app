#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

export ICAO_APP_VARIANT=development

cd "$PROJECT_ROOT"
pnpm exec expo prebuild --platform ios --no-install
(
  cd "$PROJECT_ROOT/ios"
  pod install
)
pnpm exec expo run:ios "$@"
