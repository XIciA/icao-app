#!/bin/sh

# Resolve the one cleanly generated Expo CNG workspace, scheme, and product.
configure_ios_cng_product() {
  ios_root=$1
  if [ -n "${ICAO_IOS_WORKSPACE:-}${ICAO_IOS_SCHEME:-}${ICAO_IOS_PRODUCT_NAME:-}" ]; then
    echo 'Release iOS product overrides are forbidden; use the uniquely generated CNG product.' >&2
    exit 1
  fi

  identity_file=$(mktemp "${TMPDIR:-/tmp}/icao-ios-cng-identity.XXXXXX")
  if ! node "$PROJECT_ROOT/tools/verify-ios-cng-product.mjs" "$ios_root" > "$identity_file"; then
    rm -f "$identity_file"
    exit 1
  fi
  IOS_WORKSPACE=$(sed -n '1p' "$identity_file")
  IOS_SCHEME=$(sed -n '2p' "$identity_file")
  IOS_PRODUCT_NAME=$(sed -n '3p' "$identity_file")
  rm -f "$identity_file"

  if [ -z "$IOS_WORKSPACE" ] || [ -z "$IOS_SCHEME" ] || [ -z "$IOS_PRODUCT_NAME" ]; then
    echo 'The generated iOS CNG identity is incomplete.' >&2
    exit 1
  fi
}

find_ios_release_app() {
  product_dir=$1
  product_name=${2:-}

  if [ -n "$product_name" ]; then
    app_path="$product_dir/$product_name.app"
    if [ ! -d "$app_path" ]; then
      echo "Expected iOS Release app is missing: $app_path" >&2
      exit 1
    fi
    printf '%s\n' "$app_path"
    return
  fi

  app_count=$(find "$product_dir" -maxdepth 1 -type d -name '*.app' | wc -l | tr -d ' ')
  if [ "$app_count" -ne 1 ]; then
    echo "Expected exactly one iOS Release app in $product_dir, found $app_count." >&2
    exit 1
  fi
  find "$product_dir" -maxdepth 1 -type d -name '*.app' -print -quit
}

verify_ios_storekit_dependencies() {
  podfile_lock=$1

  if [ ! -f "$podfile_lock" ]; then
    echo "The generated Podfile.lock is missing: $podfile_lock" >&2
    exit 1
  fi

  for required_pod in \
    '  - NitroIap (16.3.2):' \
    '  - NitroModules (0.36.5):' \
    '  - openiap (3.2.1)'
  do
    if ! grep -Fq "$required_pod" "$podfile_lock"; then
      echo "The iOS Release dependency graph is missing: $required_pod" >&2
      exit 1
    fi
  done
}

verify_ios_release_app() {
  app_path=$1
  api_url=$2
  supabase_url=$3
  bundle_id=$4
  marketing_version=$5
  build_number=$6
  expected_team_id=${7:-}
  bundle_path="$app_path/main.jsbundle"

  if [ ! -f "$bundle_path" ]; then
    echo "The Release JavaScript bundle is missing: $bundle_path" >&2
    exit 1
  fi
  if ! grep -aFq "$api_url" "$bundle_path"; then
    echo 'The Release bundle does not contain the configured API HTTPS URL.' >&2
    exit 1
  fi
  if ! grep -aFq "$supabase_url" "$bundle_path"; then
    echo 'The Release bundle does not contain the configured Supabase HTTPS URL.' >&2
    exit 1
  fi
  if grep -aEq '127\.0\.0\.1:(3101|8000)|https?://(10\.[0-9.]+|192\.168\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+)' "$bundle_path"; then
    echo 'The Release bundle still contains a tunnel, loopback, or private-LAN service URL.' >&2
    exit 1
  fi
  if grep -aEq '47\.109\.132\.161|api\.feizhuicao\.com|cloud\.feizhuicao\.com' "$bundle_path"; then
    echo 'The Release bundle still contains a retired legacy API host or the old ECS.' >&2
    exit 1
  fi

  info_plist_path="$app_path/Info.plist"
  if [ ! -f "$info_plist_path" ]; then
    echo "The processed Release Info.plist is missing: $info_plist_path" >&2
    exit 1
  fi

  read_release_plist() {
    /usr/libexec/PlistBuddy -c "Print :$1" "$info_plist_path" 2>/dev/null || true
  }

  assert_release_plist_value() {
    key=$1
    expected=$2
    actual=$(read_release_plist "$key")
    if [ "$actual" != "$expected" ]; then
      echo "The Release Info.plist has an unexpected $key value." >&2
      exit 1
    fi
  }

  assert_release_plist_value CFBundleDisplayName '听你五个'
  assert_release_plist_value CFBundleIdentifier "$bundle_id"
  assert_release_plist_value CFBundleShortVersionString "$marketing_version"
  assert_release_plist_value CFBundleVersion "$build_number"

  if ! /usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes' "$info_plist_path" 2>/dev/null | grep -Fq 'readyoufife'; then
    echo 'The Release app is missing the readyoufife URL scheme.' >&2
    exit 1
  fi
  if /usr/libexec/PlistBuddy -c 'Print :NSBonjourServices' "$info_plist_path" 2>/dev/null | grep -Fq '_expo._tcp'; then
    echo 'The Release app still contains the Expo Dev Launcher Bonjour service.' >&2
    exit 1
  fi
  if read_release_plist NSLocalNetworkUsageDescription | grep -Fq 'Expo Dev Launcher'; then
    echo 'The Release app still contains the Expo Dev Launcher local-network disclosure.' >&2
    exit 1
  fi
  if find "$app_path" -type d \( -name EXDevLauncher.bundle -o -name EXDevMenu.bundle \) -print -quit | grep -q .; then
    echo 'The Release app still contains an Expo development resource bundle.' >&2
    exit 1
  fi

  codesign --verify --deep --strict "$app_path"

  entitlements_path=$(mktemp "${TMPDIR:-/tmp}/icao-ios-entitlements.XXXXXX")
  if ! codesign -d --entitlements "$entitlements_path" --xml "$app_path" 2>/dev/null; then
    rm -f "$entitlements_path"
    echo 'The Release app signing entitlements could not be inspected.' >&2
    exit 1
  fi
  if ! /usr/libexec/PlistBuddy -c 'Print :com.apple.developer.applesignin:0' "$entitlements_path" 2>/dev/null | grep -Fxq 'Default'; then
    rm -f "$entitlements_path"
    echo 'The Release app is missing the Sign in with Apple entitlement.' >&2
    exit 1
  fi
  rm -f "$entitlements_path"

  if [ -n "$expected_team_id" ]; then
    signed_team_id=$(codesign -dvv "$app_path" 2>&1 \
      | sed -n 's/^TeamIdentifier=//p' \
      | head -n 1)
    if [ -z "$signed_team_id" ]; then
      signed_team_id=$(codesign -d --entitlements :- --xml "$app_path" 2>/dev/null \
        | plutil -extract application-identifier raw -o - - 2>/dev/null \
        | cut -d. -f1 || true)
    fi
    if [ "$signed_team_id" != "$expected_team_id" ]; then
      echo 'The Release app was not signed by the expected company Apple team.' >&2
      exit 1
    fi
  fi
}
