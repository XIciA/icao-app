#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ECS_HOST=${ICAO_ECS_HOST:-47.109.132.161}
ECS_USER=${ICAO_ECS_USER:-root}
SSH_KEY=${ICAO_ECS_SSH_KEY:-$HOME/.ssh/icao_app_codex}
IOS_DEVICE=${ICAO_IOS_DEVICE:-OOMG}
IOS_DEVICE_ID=${ICAO_IOS_DEVICE_ID:-00008150-0011395A3638401C}
IOS_SCHEME=${ICAO_IOS_SCHEME:-ICAO}
IOS_PRODUCT_NAME=${ICAO_IOS_PRODUCT_NAME:-ICAO}
IOS_BUNDLE_ID=${ICAO_IOS_BUNDLE_ID:-com.anonymous.icao-app}
DERIVED_DATA=${ICAO_IOS_DERIVED_DATA:-$HOME/Library/Developer/Xcode/DerivedData/ICAO-Standalone}
API_URL=${EXPO_PUBLIC_ICAO_API_URL:-https://api.feizhuicao.com}
SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL:-https://cloud.feizhuicao.com}
PUBLISHABLE_KEY=${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-}

require_https_url() {
  name=$1
  value=$2
  case "$value" in
    https://?*) ;;
    *)
      echo "$name must be a non-empty HTTPS URL." >&2
      exit 1
      ;;
  esac
  case "$value" in
    */)
      echo "$name must not end with a slash." >&2
      exit 1
      ;;
  esac
  if printf '%s\n' "$value" | grep -Eq '^https://(localhost([/:]|$)|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[::1\])'; then
    echo "$name must not use localhost, loopback, or a private-LAN address." >&2
    exit 1
  fi
}

require_https_url EXPO_PUBLIC_ICAO_API_URL "$API_URL"
require_https_url EXPO_PUBLIC_SUPABASE_URL "$SUPABASE_URL"

if [ -z "$PUBLISHABLE_KEY" ]; then
  if [ ! -r "$SSH_KEY" ]; then
    echo "Project SSH key is not readable: $SSH_KEY" >&2
    echo 'Alternatively, export EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY before building.' >&2
    exit 1
  fi

  PUBLISHABLE_KEY=$(ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" \
    "sed -n 's/^SUPABASE_PUBLISHABLE_KEY=//p' /opt/icao/runtime/api/.env | head -1")
fi

if [ -z "$PUBLISHABLE_KEY" ]; then
  echo 'Supabase publishable key is missing.' >&2
  exit 1
fi

echo 'Checking the public standalone runtime...'
curl -fsS --max-time 10 "$API_URL/health/ready" >/dev/null
curl -fsS --max-time 10 -H "apikey: $PUBLISHABLE_KEY" \
  "$SUPABASE_URL/auth/v1/settings" >/dev/null

export EXPO_PUBLIC_ICAO_API_URL=$API_URL
export EXPO_PUBLIC_SUPABASE_URL=$SUPABASE_URL
export EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
export NODE_BINARY=${NODE_BINARY:-$(command -v node)}

echo "API: $EXPO_PUBLIC_ICAO_API_URL"
echo "Supabase: $EXPO_PUBLIC_SUPABASE_URL"
echo "iOS device: $IOS_DEVICE"
echo 'The publishable key is available only to the build process and is not printed.'
echo 'Building and installing an iOS Release app with its JavaScript bundle embedded...'

cd "$PROJECT_ROOT"
xcodebuild \
  -workspace "$PROJECT_ROOT/ios/ICAO.xcworkspace" \
  -scheme "$IOS_SCHEME" \
  -configuration Release \
  -destination "id=$IOS_DEVICE_ID" \
  -derivedDataPath "$DERIVED_DATA" \
  build

APP_PATH="$DERIVED_DATA/Build/Products/Release-iphoneos/$IOS_PRODUCT_NAME.app"
BUNDLE_PATH="$APP_PATH/main.jsbundle"

if [ ! -f "$BUNDLE_PATH" ]; then
  echo "The Release JavaScript bundle is missing: $BUNDLE_PATH" >&2
  exit 1
fi
if ! grep -aFq "$API_URL" "$BUNDLE_PATH"; then
  echo 'The Release bundle does not contain the configured API HTTPS URL.' >&2
  exit 1
fi
if ! grep -aFq "$SUPABASE_URL" "$BUNDLE_PATH"; then
  echo 'The Release bundle does not contain the configured Supabase HTTPS URL.' >&2
  exit 1
fi
if grep -aEq '127\.0\.0\.1:(3101|8000)|https?://(10\.[0-9.]+|192\.168\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+)' "$BUNDLE_PATH"; then
  echo 'The Release bundle still contains a tunnel, loopback, or private-LAN service URL.' >&2
  exit 1
fi

codesign --verify --deep --strict "$APP_PATH"
xcrun devicectl device install app --device "$IOS_DEVICE" "$APP_PATH"
xcrun devicectl device process launch --device "$IOS_DEVICE" "$IOS_BUNDLE_ID"

echo 'Standalone iOS Release build, validation, installation, and launch completed.'
