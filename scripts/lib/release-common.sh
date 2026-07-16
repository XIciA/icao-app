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
  if printf '%s\n' "$value" | grep -Eq '^https://(localhost([/:]|$)|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[::1\])'; then
    echo "$name must not use localhost, loopback, or a private-LAN address." >&2
    exit 1
  fi
}

load_release_runtime() {
  API_URL=${EXPO_PUBLIC_ICAO_API_URL:-https://api.feizhuicao.com}
  SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL:-https://cloud.feizhuicao.com}
  PUBLISHABLE_KEY=${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-}
  ECS_HOST=${ICAO_ECS_HOST:-47.109.132.161}
  ECS_USER=${ICAO_ECS_USER:-root}
  SSH_KEY=${ICAO_ECS_SSH_KEY:-${HOME:?}/.ssh/icao_app_codex}

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

  export API_URL SUPABASE_URL PUBLISHABLE_KEY ECS_HOST ECS_USER SSH_KEY
  export EXPO_PUBLIC_ICAO_API_URL=$API_URL
  export EXPO_PUBLIC_SUPABASE_URL=$SUPABASE_URL
  export EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
}

check_release_runtime() {
  node_binary=${NODE_BINARY:-$(command -v node)}
  CHECK_API_URL=$API_URL CHECK_SUPABASE_URL=$SUPABASE_URL CHECK_PUBLISHABLE_KEY=$PUBLISHABLE_KEY "$node_binary" <<'NODE'
const checks = [
  ['ICAO API', `${process.env.CHECK_API_URL}/health/ready`, {}],
  ['Supabase Auth', `${process.env.CHECK_SUPABASE_URL}/auth/v1/settings`, { apikey: process.env.CHECK_PUBLISHABLE_KEY }],
];

for (const [label, url, headers] of checks) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${label} responded with HTTP ${response.status}`);
}
NODE
}
