#!/bin/sh

set -eu

if [ "${EXPO_PUBLIC_ICAO_AUDIO_E2E:-0}" = '1' ]; then
  echo 'EXPO_PUBLIC_ICAO_AUDIO_E2E is forbidden in iOS Release builds.' >&2
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ECS_HOST=${ICAO_ECS_HOST:-47.108.90.19}
ECS_USER=${ICAO_ECS_USER:-root}
SSH_KEY=${ICAO_ECS_SSH_KEY:-$HOME/.ssh/icao_app_codex}
IOS_DEVICE=${ICAO_IOS_DEVICE:-OOMG}
IOS_DEVICE_ID=${ICAO_IOS_DEVICE_ID:-00008150-0011395A3638401C}
IOS_SCHEME=${ICAO_IOS_SCHEME:-ICAO}
IOS_TEAM_ID=${ICAO_IOS_TEAM_ID:-3FX69S3S8P}
IOS_PRODUCT_NAME=${ICAO_IOS_PRODUCT_NAME:-}
IOS_BUNDLE_ID=${ICAO_IOS_BUNDLE_ID:-com.readyoufife.ios}
DERIVED_DATA=${ICAO_IOS_DERIVED_DATA:-$HOME/Library/Developer/Xcode/DerivedData/ICAO-Standalone}
API_URL=${EXPO_PUBLIC_ICAO_API_URL:-https://api.readyoufife.com}
SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL:-https://cloud.readyoufife.com}
PUBLISHABLE_KEY=${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-}
NODE_BINARY=${NODE_BINARY:-$(command -v node)}
MARKETING_VERSION=$(node -p "require('$PROJECT_ROOT/app.json').expo.version")
IOS_BUILD_NUMBER=$(node -p "require('$PROJECT_ROOT/app.json').expo.ios.buildNumber || '1'")

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
  if printf '%s\n' "$value" | grep -Eq '(^|//)(api|cloud)\.feizhuicao\.com([/:]|$)|47\.109\.132\.161'; then
    echo "$name must not use a retired legacy API host or the old ECS." >&2
    exit 1
  fi
}

check_https_endpoint() {
  label=$1
  url=$2
  api_key=$3

  CHECK_LABEL=$label CHECK_URL=$url CHECK_APIKEY=$api_key "$NODE_BINARY" <<'NODE'
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10_000);

void (async () => {
  try {
    const apiKey = process.env.CHECK_APIKEY;
    const response = await fetch(process.env.CHECK_URL, {
      headers: apiKey ? { apikey: apiKey } : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${process.env.CHECK_LABEL} responded with HTTP ${response.status}.`);
    }
  } catch (error) {
    console.error(
      `${process.env.CHECK_LABEL} HTTPS check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
})();
NODE
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
check_https_endpoint ICAO_API "$API_URL/health/ready" ''
check_https_endpoint SUPABASE_AUTH "$SUPABASE_URL/auth/v1/settings" "$PUBLISHABLE_KEY"

export EXPO_PUBLIC_ICAO_API_URL=$API_URL
export EXPO_PUBLIC_SUPABASE_URL=$SUPABASE_URL
export EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
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
if [ -n "$IOS_PRODUCT_NAME" ]; then
  APP_PATH="$PRODUCT_DIR/$IOS_PRODUCT_NAME.app"
else
  APP_COUNT=$(find "$PRODUCT_DIR" -maxdepth 1 -type d -name '*.app' | wc -l | tr -d ' ')
  if [ "$APP_COUNT" -ne 1 ]; then
    echo "Expected exactly one iOS Release app in $PRODUCT_DIR, found $APP_COUNT." >&2
    exit 1
  fi
  APP_PATH=$(find "$PRODUCT_DIR" -maxdepth 1 -type d -name '*.app' -print -quit)
fi
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
if grep -aEq '47\.109\.132\.161|api\.feizhuicao\.com|cloud\.feizhuicao\.com' "$BUNDLE_PATH"; then
  echo 'The Release bundle still contains a retired legacy API host or the old ECS.' >&2
  exit 1
fi

INFO_PLIST_PATH="$APP_PATH/Info.plist"
if [ ! -f "$INFO_PLIST_PATH" ]; then
  echo "The processed Release Info.plist is missing: $INFO_PLIST_PATH" >&2
  exit 1
fi

read_plist() {
  /usr/libexec/PlistBuddy -c "Print :$1" "$INFO_PLIST_PATH" 2>/dev/null || true
}

assert_plist_value() {
  key=$1
  expected=$2
  actual=$(read_plist "$key")
  if [ "$actual" != "$expected" ]; then
    echo "The Release Info.plist has an unexpected $key value." >&2
    exit 1
  fi
}

assert_plist_value CFBundleDisplayName '听你五个'
assert_plist_value CFBundleIdentifier "$IOS_BUNDLE_ID"
assert_plist_value CFBundleShortVersionString "$MARKETING_VERSION"
assert_plist_value CFBundleVersion "$IOS_BUILD_NUMBER"

if ! /usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes' "$INFO_PLIST_PATH" 2>/dev/null | grep -Fq 'readyoufife'; then
  echo 'The Release app is missing the readyoufife URL scheme.' >&2
  exit 1
fi
if /usr/libexec/PlistBuddy -c 'Print :NSBonjourServices' "$INFO_PLIST_PATH" 2>/dev/null | grep -Fq '_expo._tcp'; then
  echo 'The Release app still contains the Expo Dev Launcher Bonjour service.' >&2
  exit 1
fi
if read_plist NSLocalNetworkUsageDescription | grep -Fq 'Expo Dev Launcher'; then
  echo 'The Release app still contains the Expo Dev Launcher local-network disclosure.' >&2
  exit 1
fi
if find "$APP_PATH" -type d \( -name EXDevLauncher.bundle -o -name EXDevMenu.bundle \) -print -quit | grep -q .; then
  echo 'The Release app still contains an Expo development resource bundle.' >&2
  exit 1
fi

codesign --verify --deep --strict "$APP_PATH"
xcrun devicectl device install app --device "$IOS_DEVICE" "$APP_PATH"
if ! xcrun devicectl device process launch --device "$IOS_DEVICE" "$IOS_BUNDLE_ID"; then
  echo 'The Release app was installed but iOS did not allow it to launch.' >&2
  echo 'On the iPhone, trust the developer under Settings > General > VPN & Device Management, then launch again.' >&2
  exit 1
fi

echo 'Standalone iOS Release build, validation, installation, and launch completed.'
