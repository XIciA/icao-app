#!/bin/sh

release_project_root() {
  script_dir=$(CDPATH= cd -- "$(dirname -- "$1")" && pwd)
  CDPATH= cd -- "$script_dir/.." && pwd
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command is missing: $1" >&2
    exit 1
  fi
}

require_public_https_url() {
  name=$1
  value=$2
  case "$value" in
    https://?*) ;;
    *) echo "$name must be a non-empty HTTPS URL." >&2; exit 1 ;;
  esac
  case "$value" in
    */) echo "$name must not end with a slash." >&2; exit 1 ;;
  esac
  case "$value" in
    *[!A-Za-z0-9:/._~%+-]*)
      echo "$name contains whitespace, control characters, or shell metacharacters and cannot be passed to a remote release command." >&2
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

load_release_runtime() {
  API_URL=${EXPO_PUBLIC_ICAO_API_URL:-https://api.readyoufife.com}
  SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL:-https://cloud.readyoufife.com}
  PUBLISHABLE_KEY=${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-}
  ECS_HOST=${ICAO_ECS_HOST:-47.108.90.19}
  ECS_USER=${ICAO_ECS_USER:-root}
  SSH_KEY=${ICAO_ECS_SSH_KEY:-${HOME:?}/.ssh/icao_app_codex}
  ICAO_IOS_TEAM_ID=${ICAO_IOS_TEAM_ID:-3FX69S3S8P}

  require_public_https_url EXPO_PUBLIC_ICAO_API_URL "$API_URL"
  require_public_https_url EXPO_PUBLIC_SUPABASE_URL "$SUPABASE_URL"

  if [ -z "$PUBLISHABLE_KEY" ]; then
    if [ ! -r "$SSH_KEY" ]; then
      echo "Project SSH key is not readable: $SSH_KEY" >&2
      exit 1
    fi
    PUBLISHABLE_KEY=$(ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" \
      "sed -n 's/^SUPABASE_PUBLISHABLE_KEY=//p' /opt/icao/runtime/api/.env | head -1")
  fi
  if [ -z "$PUBLISHABLE_KEY" ]; then
    echo 'Supabase publishable key is missing.' >&2
    exit 1
  fi

  export API_URL SUPABASE_URL PUBLISHABLE_KEY ECS_HOST ECS_USER SSH_KEY ICAO_IOS_TEAM_ID
  export EXPO_PUBLIC_ICAO_API_URL=$API_URL
  export EXPO_PUBLIC_SUPABASE_URL=$SUPABASE_URL
  export EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
}

check_release_runtime() {
  required_social_provider=${1:-}
  node_binary=${NODE_BINARY:-$(command -v node)}
  "$node_binary" "$PROJECT_ROOT/tools/check-wechat-login-runtime.mjs"
  CHECK_API_URL=$API_URL CHECK_SUPABASE_URL=$SUPABASE_URL CHECK_PUBLISHABLE_KEY=$PUBLISHABLE_KEY CHECK_SOCIAL_PROVIDER=$required_social_provider "$node_binary" <<'NODE'
const api = await fetch(`${process.env.CHECK_API_URL}/health/ready`, {
  signal: AbortSignal.timeout(10_000),
});
if (!api.ok) throw new Error(`ICAO API responded with HTTP ${api.status}`);

const auth = await fetch(`${process.env.CHECK_SUPABASE_URL}/auth/v1/settings`, {
  headers: { apikey: process.env.CHECK_PUBLISHABLE_KEY },
  signal: AbortSignal.timeout(10_000),
});
if (!auth.ok) throw new Error(`Supabase Auth responded with HTTP ${auth.status}`);
const settings = await auth.json();
if (settings.disable_signup === true || settings.external?.phone !== true || settings.phone_autoconfirm === true) {
  throw new Error('Supabase Auth is not ready for real Native phone signup.');
}
if (process.env.CHECK_SOCIAL_PROVIDER && settings.external?.[process.env.CHECK_SOCIAL_PROVIDER] !== true) {
  throw new Error(`Supabase Auth provider is not enabled: ${process.env.CHECK_SOCIAL_PROVIDER}`);
}
const wechatChallenge = await fetch(`${process.env.CHECK_API_URL}/v1/auth/wechat/challenge`, {
  method: 'POST',
  signal: AbortSignal.timeout(10_000),
});
const wechatBody = await wechatChallenge.json().catch(() => undefined);
if (!wechatChallenge.ok || wechatBody?.data?.status !== 'available') {
  throw new Error('The production WeChat login challenge is not available.');
}

for (const path of ['/v1/auth/phone/otp/start', '/v1/auth/phone/recovery/start']) {
  const response = await fetch(`${process.env.CHECK_API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: 'invalid-release-probe' }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => undefined);
  if (response.status !== 400 || body?.error?.code !== 'invalid_phone_number') {
    throw new Error(`Server-owned phone OTP route is not ready: ${path}`);
  }
}
NODE
}

check_wechat_candidate_configuration() {
  node_binary=${NODE_BINARY:-$(command -v node)}
  "$node_binary" "$PROJECT_ROOT/tools/check-wechat-login-runtime.mjs" --candidate-config
}

check_wechat_android_project() {
  node_binary=${NODE_BINARY:-$(command -v node)}
  "$node_binary" "$PROJECT_ROOT/tools/check-wechat-login-runtime.mjs" --candidate-android-project
}

check_wechat_android_artifact() {
  artifact=$1
  node_binary=${NODE_BINARY:-$(command -v node)}
  "$node_binary" "$PROJECT_ROOT/tools/check-wechat-login-runtime.mjs" --candidate-android-artifact "$artifact"
}

check_wechat_ios_artifact() {
  artifact=$1
  node_binary=${NODE_BINARY:-$(command -v node)}
  "$node_binary" "$PROJECT_ROOT/tools/check-wechat-login-runtime.mjs" --candidate-ios-artifact "$artifact"
}
