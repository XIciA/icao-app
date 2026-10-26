#!/bin/sh

set -eu
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"

MODE=${1:-deploy}
case "$MODE" in
  deploy|rollback) ;;
  *) echo 'Usage: scripts/deploy-ops-release.sh [deploy|rollback <release-id>]' >&2; exit 1 ;;
esac

SOURCE_ROOT=${ICAO_OPS_RELEASE_SOURCE_ROOT:-$PROJECT_ROOT}
SOURCE_ROOT=$(CDPATH= cd -- "$SOURCE_ROOT" && pwd)
SOURCE_GIT_ROOT=$(git -C "$SOURCE_ROOT" rev-parse --show-toplevel 2>/dev/null || true)
if [ "$SOURCE_GIT_ROOT" != "$SOURCE_ROOT" ]; then
  echo 'ICAO_OPS_RELEASE_SOURCE_ROOT must be the root of a Git worktree.' >&2
  exit 1
fi

node "$SOURCE_ROOT/tools/check-mainline-release.mjs" --root "$SOURCE_ROOT"

for command_name in git gzip mktemp node openssl scp shasum ssh; do
  require_command "$command_name"
done

OPS_PUBLIC_HOST=api.readyoufife.com
if [ "${ICAO_OPS_PRODUCTION_CONFIRM:-}" != "$OPS_PUBLIC_HOST" ]; then
  echo "Set ICAO_OPS_PRODUCTION_CONFIRM=$OPS_PUBLIC_HOST for an explicitly authorized production action." >&2
  exit 1
fi

ECS_HOST=${ICAO_ECS_HOST:-47.108.90.19}
ECS_USER=${ICAO_ECS_USER:-root}
SSH_KEY=${ICAO_ECS_SSH_KEY:-${HOME:?}/.ssh/icao_app_codex}
EXPECTED_PUBLIC_IP=${ICAO_OPS_EXPECTED_PUBLIC_IP:-}
BUILD_NPM_REGISTRY=${ICAO_OPS_BUILD_NPM_REGISTRY:-https://registry.npmmirror.com}

if [ ! -r "$SSH_KEY" ]; then
  echo "Project SSH key is not readable: $SSH_KEY" >&2
  exit 1
fi

SOURCE_SHA=$(git -C "$SOURCE_ROOT" rev-parse HEAD)
case "$SOURCE_SHA" in
  ''|*[!A-Fa-f0-9]*) echo 'The Ops source SHA is invalid.' >&2; exit 1 ;;
esac

if [ "$MODE" = rollback ]; then
  RELEASE_ID=${2:-}
  case "$RELEASE_ID" in
    ''|*[!A-Za-z0-9._-]*) echo 'A valid release ID is required for rollback.' >&2; exit 1 ;;
  esac
  if [ "${ICAO_OPS_ROLLBACK_CONFIRM:-}" != "$RELEASE_ID" ]; then
    echo "Set ICAO_OPS_ROLLBACK_CONFIRM=$RELEASE_ID to consume that release's rollback snapshot." >&2
    exit 1
  fi
  rollback_result=$(mktemp "${TMPDIR:-/tmp}/icao-ops-rollback.XXXXXX")
  cleanup_rollback_result() {
    rm -f "$rollback_result"
  }
  trap cleanup_rollback_result EXIT
  trap 'exit 1' HUP INT TERM
  ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- \
    "$RELEASE_ID" > "$rollback_result" <<'REMOTE_ROLLBACK'
set -eu
release_id=$1
case "$release_id" in
  ''|*[!A-Za-z0-9._-]*) echo 'Remote Ops rollback release ID is invalid.' >&2; exit 1 ;;
esac
exec 9<>/run/lock/icao-ops-release.lock
if ! flock -n 9; then
  echo 'Another Ops deployment or rollback is running.' >&2
  exit 1
fi
# Keep the same lock order as the deploy path: the Ops-specific lock is
# acquired first, followed by the release-wide lock shared with migrations.
exec 8<>/run/lock/icao-production-release-change.lock
if ! flock -n 8; then
  echo 'A production database migration or release change is already running.' >&2
  exit 1
fi
release_dir=/opt/icao/runtime/releases/ops-$release_id
rollback_script=$release_dir/source/infra/ops/rollback-release.sh
state_script=$release_dir/source/infra/ops/release-state.sh
if [ ! -f "$rollback_script" ] || [ -L "$rollback_script" ] \
  || [ ! -f "$state_script" ] || [ -L "$state_script" ]; then
  echo 'The requested release has no usable rollback snapshot.' >&2
  exit 1
fi
attempt_dir=$(ICAO_OPS_RELEASE_STATE_INTERNAL=1 \
  /bin/sh "$state_script" resolve "$release_dir")
ICAO_OPS_ROLLBACK_INTERNAL=1 /bin/sh "$rollback_script" "$attempt_dir" manual >&2
printf '%s\n' "$attempt_dir"
REMOTE_ROLLBACK
  remote_attempt=$(cat "$rollback_result")
  case "$remote_attempt" in
    /opt/icao/runtime/releases/ops-*/attempts/*) ;;
    *) echo 'Remote rollback evidence path is invalid.' >&2; exit 1 ;;
  esac
  case "$remote_attempt" in
    *[!A-Za-z0-9_./-]*|*..*) echo 'Remote rollback evidence path contains unsafe characters.' >&2; exit 1 ;;
  esac
  local_evidence_dir=$PROJECT_ROOT/.generated/ops-release/$RELEASE_ID
  mkdir -p "$local_evidence_dir"
  scp -i "$SSH_KEY" -q \
    "$ECS_USER@$ECS_HOST:$remote_attempt/rollback-evidence.json" \
    "$local_evidence_dir/rollback-evidence.json"
  chmod 600 "$local_evidence_dir/rollback-evidence.json"
  echo "Rollback evidence copied to $local_evidence_dir/rollback-evidence.json"
  exit 0
fi

require_public_https_url ICAO_OPS_BUILD_NPM_REGISTRY "$BUILD_NPM_REGISTRY"
if [ -z "$EXPECTED_PUBLIC_IP" ]; then
  echo 'ICAO_OPS_EXPECTED_PUBLIC_IP is required; confirm the current ECS public IPv4 address before deployment.' >&2
  exit 1
fi
node -e '
const value = process.argv[1];
const parts = value.split(".");
if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
  process.exit(1);
}
' "$EXPECTED_PUBLIC_IP" || {
  echo 'ICAO_OPS_EXPECTED_PUBLIC_IP must be a valid IPv4 address.' >&2
  exit 1
}

RELEASE_ID=${ICAO_OPS_RELEASE_ID:-ops-$(printf '%.12s' "$SOURCE_SHA")}
case "$RELEASE_ID" in
  ''|*[!A-Za-z0-9._-]*) echo 'ICAO_OPS_RELEASE_ID contains unsupported characters.' >&2; exit 1 ;;
esac

archive_dir=$(mktemp -d "${TMPDIR:-/tmp}/icao-ops-release.XXXXXX")
archive=$archive_dir/source.tar.gz
cleanup_local_archive() {
  rm -rf "$archive_dir"
}
trap cleanup_local_archive EXIT
trap 'exit 1' HUP INT TERM

(
  cd "$SOURCE_ROOT"
  git archive --format=tar HEAD -- \
    package.json pnpm-lock.yaml pnpm-workspace.yaml patches \
    modules/icao-distribution-environment modules/icao-wechat-auth \
    apps/ops packages/contracts services/api content/vocabulary infra/ops infra/gateway \
    | gzip -n > "$archive"
)
archive_sha=$(shasum -a 256 "$archive" | awk '{ print $1 }')
case "$archive_sha" in
  ''|*[!A-Fa-f0-9]*) echo 'Ops archive SHA-256 is invalid.' >&2; exit 1 ;;
esac
upload_token=$(openssl rand -hex 16)
case "$upload_token" in
  ''|*[!A-Fa-f0-9]*) echo 'Ops upload token is invalid.' >&2; exit 1 ;;
esac
node "$SOURCE_ROOT/tools/check-mainline-release.mjs" --root "$SOURCE_ROOT"
[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" = "$SOURCE_SHA" ] || {
  echo 'The Ops source changed while the immutable archive was being created.' >&2
  exit 1
}

remote_upload_root=/opt/icao/runtime/releases/ops-uploads
remote_upload_dir=$remote_upload_root/stage-$RELEASE_ID-$upload_token
remote_upload=$remote_upload_dir/source.tar.gz
printf '%s  %s\n' "$archive_sha" "$(basename "$remote_upload")" > "$archive.sha256"
chmod 600 "$archive" "$archive.sha256"
ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" \
  sh -s -- "$RELEASE_ID" "$upload_token" <<'REMOTE_STAGE'
set -eu
umask 077

release_id=$1
upload_token=$2
release_root=${3:-/opt/icao/runtime/releases}
expected_owner=${4:-0}
lock_file=${5:-/run/lock/icao-ops-release.lock}

case "$release_id" in
  ''|*[!A-Za-z0-9._-]*) echo 'Remote Ops staging release ID is invalid.' >&2; exit 1 ;;
esac
case "$upload_token" in
  ''|*[!A-Fa-f0-9]*) echo 'Remote Ops staging token is invalid.' >&2; exit 1 ;;
esac
case "$expected_owner" in
  ''|*[!0-9]*) echo 'Remote Ops staging owner is invalid.' >&2; exit 1 ;;
esac
if [ "$release_root" = /opt/icao/runtime/releases ]; then
  [ "$expected_owner" = 0 ] && [ "$lock_file" = /run/lock/icao-ops-release.lock ] || {
    echo 'Production Ops staging overrides are forbidden.' >&2
    exit 1
  }
fi

read_uid() {
  stat -c %u "$1" 2>/dev/null || stat -f %u "$1"
}

read_mode() {
  stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"
}

validate_release_root() {
  [ -d "$release_root" ] && [ ! -L "$release_root" ] || {
    echo 'The fixed Ops release parent must be a real directory.' >&2
    return 1
  }
  [ "$(read_uid "$release_root")" = "$expected_owner" ] || {
    echo 'The fixed Ops release parent has an unexpected owner.' >&2
    return 1
  }
  case "$(read_mode "$release_root")" in
    700|710|711|750|751|755) ;;
    *) echo 'The fixed Ops release parent has unsafe permissions.' >&2; return 1 ;;
  esac
}

validate_private_dir() {
  checked_dir=$1
  [ -d "$checked_dir" ] && [ ! -L "$checked_dir" ] || return 1
  [ "$(read_uid "$checked_dir")" = "$expected_owner" ] || return 1
  [ "$(read_mode "$checked_dir")" = 700 ] || return 1
}

upload_root=$release_root/ops-uploads
stage_dir=$upload_root/stage-$release_id-$upload_token
upload=$stage_dir/source.tar.gz
checksum=$upload.sha256

# These read-only gates intentionally precede the lock-file open and every target write.
validate_release_root
if [ -e "$upload_root" ] || [ -L "$upload_root" ]; then
  validate_private_dir "$upload_root" || {
    echo 'The Ops upload root has an unsafe type, owner, or permissions.' >&2
    exit 1
  }
fi
for command_name in chmod flock mkdir stat; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required remote staging command is missing: $command_name" >&2
    exit 1
  }
done

exec 9>"$lock_file"
if ! flock -n 9; then
  echo 'Another Ops deployment or rollback is running.' >&2
  exit 1
fi

# Revalidate beneath the lock before atomically establishing the private staging boundary.
validate_release_root
if [ -e "$upload_root" ] || [ -L "$upload_root" ]; then
  validate_private_dir "$upload_root" || {
    echo 'The Ops upload root has an unsafe type, owner, or permissions.' >&2
    exit 1
  }
else
  mkdir -m 700 "$upload_root"
  validate_private_dir "$upload_root" || {
    echo 'The new Ops upload root failed secure validation.' >&2
    exit 1
  }
fi
[ ! -e "$stage_dir" ] && [ ! -L "$stage_dir" ] || {
  echo 'The Ops upload staging directory already exists.' >&2
  exit 1
}
mkdir -m 700 "$stage_dir"
validate_private_dir "$stage_dir" || {
  echo 'The new Ops upload staging directory failed secure validation.' >&2
  exit 1
}
: > "$upload"
: > "$checksum"
chmod 600 "$upload" "$checksum"
REMOTE_STAGE
scp -i "$SSH_KEY" -q "$archive" "$ECS_USER@$ECS_HOST:$remote_upload"
scp -i "$SSH_KEY" -q "$archive.sha256" "$ECS_USER@$ECS_HOST:$remote_upload.sha256"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- \
  "$RELEASE_ID" "$SOURCE_SHA" "$archive_sha" "$upload_token" \
  "$EXPECTED_PUBLIC_IP" "$BUILD_NPM_REGISTRY" "$OPS_PUBLIC_HOST" <<'REMOTE_DEPLOY'
set -eu
umask 077

release_id=$1
source_sha=$2
archive_sha=$3
upload_token=$4
expected_public_ip=$5
build_npm_registry=$6
public_host=$7

case "$release_id" in
  ''|*[!A-Za-z0-9._-]*) echo 'Remote Ops release ID is invalid.' >&2; exit 1 ;;
esac
case "$source_sha" in
  ''|*[!A-Fa-f0-9]*) echo 'Remote Ops source SHA is invalid.' >&2; exit 1 ;;
esac
case "$archive_sha" in
  ''|*[!A-Fa-f0-9]*) echo 'Remote Ops archive SHA is invalid.' >&2; exit 1 ;;
esac
case "$upload_token" in
  ''|*[!A-Fa-f0-9]*) echo 'Remote Ops upload token is invalid.' >&2; exit 1 ;;
esac
[ "$public_host" = api.readyoufife.com ] || { echo 'Remote Ops hostname is invalid.' >&2; exit 1; }

for command_name in awk basename cat chmod curl date df dirname docker find flock getent grep install mv python3 rmdir rm sed seq sha256sum sleep ss stat systemctl tar tr; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required remote command is missing: $command_name" >&2
    exit 1
  }
done

exec 9<>/run/lock/icao-ops-release.lock
if ! flock -n 9; then
  echo 'Another Ops deployment or rollback is running.' >&2
  exit 1
fi
exec 8<>/run/lock/icao-production-release-change.lock
if ! flock -n 8; then
  echo 'A production database migration or release change is already running.' >&2
  exit 1
fi

release_root=/opt/icao/runtime/releases
release_dir=$release_root/ops-$release_id
upload_root=$release_root/ops-uploads
upload_dir=$upload_root/stage-$release_id-$upload_token
upload=$upload_dir/source.tar.gz
checksum=$upload.sha256
source_dir=$release_dir/source
runtime_root=/opt/icao/runtime/ops
runtime_compose=$runtime_root/docker-compose.yml
runtime_env=/opt/icao/runtime/ops-api/.env
gateway_root=/opt/icao/runtime/gateway
gateway_caddy=$gateway_root/Caddyfile
gateway_compose=$gateway_root/docker-compose.yml
gateway_env=$gateway_root/.env
candidate_api=icao-ops-api:candidate-$release_id
candidate_web=icao-ops-web:candidate-$release_id
rollback_armed=0
committed=0
attempt_dir=
partial_release=
postgres_password_loaded=0
upload_staging_validated=0

check_root_directory() {
  checked_dir=$1
  [ -d "$checked_dir" ] && [ ! -L "$checked_dir" ] || return 1
  [ "$(stat -c %u "$checked_dir")" = 0 ] || return 1
  case "$(stat -c %a "$checked_dir")" in
    700|710|711|750|751|755) return 0 ;;
    *) return 1 ;;
  esac
}

check_private_directory() {
  checked_dir=$1
  [ -d "$checked_dir" ] && [ ! -L "$checked_dir" ] || return 1
  [ "$(stat -c %u "$checked_dir")" = 0 ] || return 1
  [ "$(stat -c %a "$checked_dir")" = 700 ] || return 1
}

check_private_upload() {
  checked_file=$1
  [ -f "$checked_file" ] && [ ! -L "$checked_file" ] || return 1
  [ "$(stat -c %u "$checked_file")" = 0 ] || return 1
  [ "$(stat -c %a "$checked_file")" = 600 ] || return 1
}

case "$upload_dir" in
  "$upload_root"/stage-"$release_id"-"$upload_token") ;;
  *) echo 'Remote upload staging path escaped its root.' >&2; exit 1 ;;
esac
check_root_directory "$release_root" || {
  echo 'The fixed Ops release parent has an unsafe type, owner, or permissions.' >&2
  exit 1
}
check_private_directory "$upload_root" && check_private_directory "$upload_dir" || {
  echo 'The Ops upload staging boundary has an unsafe type, owner, or permissions.' >&2
  exit 1
}
check_private_upload "$upload" && check_private_upload "$checksum" || {
  echo 'The remote Ops upload files have an unsafe type, owner, or permissions.' >&2
  exit 1
}
upload_staging_validated=1

finish() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "$rollback_armed" -eq 1 ] && [ "$committed" -ne 1 ]; then
    if ! ICAO_OPS_RELEASE_STATE_INTERNAL=1 \
      /bin/sh "$source_dir/infra/ops/release-state.sh" automatic "$attempt_dir" \
      "$source_dir/infra/ops/rollback-release.sh"; then
      echo 'Automatic Ops rollback failed; inspect the root-only attempt evidence before any retry.' >&2
      status=2
    fi
  fi
  if [ -n "$partial_release" ]; then
    case "$partial_release" in
      "$release_root"/ops-*.partial.*) rm -rf "$partial_release" ;;
      *) echo 'Refusing to clean an invalid partial Ops release path.' >&2; status=2 ;;
    esac
  fi
  if [ "$postgres_password_loaded" -eq 1 ]; then
    unset POSTGRES_PASSWORD
    postgres_password_loaded=0
  fi
  if [ "$upload_staging_validated" -eq 1 ]; then
    rm -f "$upload" "$checksum"
    rmdir "$upload_dir" || status=2
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 1' HUP INT TERM

(
  cd "$upload_dir"
  sha256sum -c "$(basename "$checksum")"
)
actual_archive_sha=$(sha256sum "$upload" | awk '{ print $1 }')
[ "$actual_archive_sha" = "$archive_sha" ] || { echo 'Remote Ops archive checksum mismatch.' >&2; exit 1; }

if [ -e "$release_dir" ]; then
  [ -d "$release_dir" ] && [ ! -L "$release_dir" ] || {
    echo 'Existing Ops release path is unsafe.' >&2
    exit 1
  }
  grep -Fx "source_sha=$source_sha" "$release_dir/release-metadata" >/dev/null
  grep -Fx "archive_sha256=$archive_sha" "$release_dir/release-metadata" >/dev/null
  [ "$(sha256sum "$release_dir/source.tar.gz" | awk '{ print $1 }')" = "$archive_sha" ] || {
    echo 'Stored immutable Ops source archive checksum mismatch.' >&2
    exit 1
  }
  if [ -e "$release_dir/deployment-evidence.json" ]; then
    echo 'This immutable Ops release ID has already been deployed; use a new reviewed release identity.' >&2
    exit 1
  fi
else
  partial_release=$release_dir.partial.$$
  [ ! -e "$partial_release" ] || { echo 'Ops partial release path already exists.' >&2; exit 1; }
  install -d -m 700 "$partial_release" "$partial_release/source"
  install -m 600 "$upload" "$partial_release/source.tar.gz"
  tar -xzf "$partial_release/source.tar.gz" -C "$partial_release/source"
  for required in \
    infra/ops/docker-compose.runtime.yml \
    infra/ops/cleanup-ops-uploads.sh \
    infra/ops/postgres-password.sh \
    infra/ops/release-state.sh \
    infra/ops/rollback-release.sh \
    infra/ops/verify-ops-absence.sh \
    infra/gateway/Caddyfile \
    infra/gateway/docker-compose.yml \
    services/api/scripts/migration-plan.mjs \
    services/api/scripts/verify-ops-production-readiness.mjs
  do
    [ -f "$partial_release/source/$required" ] || {
      echo "Ops release source is incomplete: $required" >&2
      exit 1
    }
  done
  {
    printf 'release_id=%s\n' "$release_id"
    printf 'source_sha=%s\n' "$source_sha"
    printf 'archive_sha256=%s\n' "$archive_sha"
  } > "$partial_release/release-metadata"
  chmod 600 "$partial_release/release-metadata"
  mv "$partial_release" "$release_dir"
fi

ICAO_OPS_UPLOAD_JANITOR_LOCK_HELD=1 \
  /bin/sh "$source_dir/infra/ops/cleanup-ops-uploads.sh" cleanup \
  "$upload_root" "$upload" "$checksum"
. "$source_dir/infra/ops/postgres-password.sh"

check_private_file() {
  checked_file=$1
  [ -f "$checked_file" ] && [ ! -L "$checked_file" ] || return 1
  [ "$(stat -c %u "$checked_file")" = 0 ] || return 1
  [ "$(stat -c %a "$checked_file")" = 600 ] || return 1
}

if ! check_private_file "$runtime_env"; then
  echo 'The Ops API environment must be a root-owned regular file with mode 0600.' >&2
  exit 1
fi
if ! check_private_file "$gateway_env"; then
  echo 'The gateway environment must be a root-owned regular file with mode 0600.' >&2
  exit 1
fi

if ! awk '
  BEGIN {
    split("DATABASE_URL NODE_ENV API_RELEASE_ID ACCOUNT_IDENTITY_HASH_SECRET OPS_ENABLED OPS_HOST OPS_PORT OPS_CORS_ORIGINS OPS_SESSION_HASH_SECRET OPS_TOTP_ENCRYPTION_KEY OPS_TRUSTED_PROXY_SHARED_SECRET", keys)
    for (key_index in keys) allowed[keys[key_index]] = 1
    optional["OPS_FEEDBACK_STORAGE_URL"] = 1
    optional["OPS_FEEDBACK_STORAGE_READ_TOKEN"] = 1
    optional["OPS_VOCABULARY_STORAGE_WRITE_TOKEN"] = 1
  }
  /^[[:space:]]*($|#)/ { next }
  !/^[A-Z0-9_]+=/ { exit 1 }
  {
    key = $0
    sub(/=.*/, "", key)
    if ((!allowed[key] && !optional[key]) || ++seen[key] != 1) exit 1
  }
  END {
    for (key in allowed) if (seen[key] != 1) exit 1
  }
' "$runtime_env"; then
  echo 'The Ops API environment does not match the production allowlist.' >&2
  exit 1
fi
if ! awk '
  /^[[:space:]]*($|#)/ { next }
  !/^OPS_TRUSTED_PROXY_SHARED_SECRET=/ { exit 1 }
  { if (++seen != 1) exit 1 }
  END { if (seen != 1) exit 1 }
' "$gateway_env"; then
  echo 'The gateway environment must contain only the Ops proxy secret.' >&2
  exit 1
fi

read_env_value() {
  env_name=$1
  env_file=$2
  sed -n "s/^$env_name=//p" "$env_file"
}

[ "$(read_env_value NODE_ENV "$runtime_env")" = production ] || { echo 'Ops NODE_ENV must be production.' >&2; exit 1; }
[ "$(read_env_value OPS_ENABLED "$runtime_env")" = 1 ] || { echo 'OPS_ENABLED must be 1.' >&2; exit 1; }
[ "$(read_env_value OPS_HOST "$runtime_env")" = 0.0.0.0 ] || { echo 'OPS_HOST must be 0.0.0.0 inside the container.' >&2; exit 1; }
[ "$(read_env_value OPS_PORT "$runtime_env")" = 3102 ] || { echo 'OPS_PORT must be 3102.' >&2; exit 1; }
[ "$(read_env_value OPS_CORS_ORIGINS "$runtime_env")" = "https://$public_host" ] || {
  echo 'OPS_CORS_ORIGINS must contain only the formal Ops HTTPS origin.' >&2
  exit 1
}
ops_proxy_secret=$(read_env_value OPS_TRUSTED_PROXY_SHARED_SECRET "$runtime_env")
gateway_proxy_secret=$(read_env_value OPS_TRUSTED_PROXY_SHARED_SECRET "$gateway_env")
[ "${#ops_proxy_secret}" -ge 32 ] && [ "$ops_proxy_secret" = "$gateway_proxy_secret" ] || {
  echo 'The dedicated Ops proxy secrets are missing or do not match.' >&2
  exit 1
}
unset ops_proxy_secret gateway_proxy_secret

docker network inspect supabase_default >/dev/null
[ -f "$gateway_caddy" ] && [ ! -L "$gateway_caddy" ] || { echo 'Current gateway Caddyfile is missing.' >&2; exit 1; }
[ -f "$gateway_compose" ] && [ ! -L "$gateway_compose" ] || { echo 'Current gateway Compose file is missing.' >&2; exit 1; }
[ "$(docker inspect -f '{{.State.Running}}' icao-gateway)" = true ] || { echo 'The production gateway is not running.' >&2; exit 1; }
curl -fsS --max-time 10 https://api.readyoufife.com/health/ready >/dev/null
regular_admin_status=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' https://api.readyoufife.com/v1/admin/health)
[ "$regular_admin_status" = 404 ] || {
  echo 'The ordinary API unexpectedly exposes an Ops admin path.' >&2
  exit 1
}
if ! getent ahostsv4 "$public_host" | awk '{ print $1 }' | grep -Fx "$expected_public_ip" >/dev/null; then
  echo 'Ops DNS does not resolve to the explicitly confirmed ECS public IPv4 address.' >&2
  exit 1
fi

api_exists=0
web_exists=0
docker inspect icao-ops-api >/dev/null 2>&1 && api_exists=1
docker inspect icao-ops-web >/dev/null 2>&1 && web_exists=1
if [ "$api_exists" -ne "$web_exists" ]; then
  echo 'The existing Ops runtime is partial; repair it before deployment.' >&2
  exit 1
fi
if [ "$api_exists" -eq 1 ]; then
  [ "$(docker inspect -f '{{.State.Running}}' icao-ops-api)" = true ] \
    && [ "$(docker inspect -f '{{.State.Running}}' icao-ops-web)" = true ] || {
      echo 'The existing Ops containers must both be running before an update.' >&2
      exit 1
    }
  curl -fsS --max-time 5 http://127.0.0.1:3102/health/ready >/dev/null
  curl -fsS --max-time 5 http://127.0.0.1:4180/ >/dev/null
fi

production_database_bytes=$(docker exec supabase-db \
  psql -X -qAt -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
  -c 'select pg_database_size(current_database())')
available_before_build_kib=$(df -Pk /opt/icao | awk 'NR == 2 { print $4 }')
[ -n "$production_database_bytes" ] && [ -n "$available_before_build_kib" ] || {
  echo 'Production database size or free-space evidence is missing.' >&2
  exit 1
}
case "$production_database_bytes:$available_before_build_kib" in
  *[!0-9:]*) echo 'Production database size or free-space evidence is invalid.' >&2; exit 1 ;;
esac
[ "$production_database_bytes" -gt 0 ] || { echo 'Production database size must be positive.' >&2; exit 1; }
available_before_build_bytes=$((available_before_build_kib * 1024))
required_before_build_bytes=$((production_database_bytes * 2 + 4 * 1024 * 1024 * 1024))
if [ "$available_before_build_bytes" -lt "$required_before_build_bytes" ]; then
  echo 'Insufficient ECS disk headroom for candidate images, a fresh backup, and an isolated restore.' >&2
  exit 1
fi

docker build \
  --build-arg "ICAO_API_RELEASE_ID=$release_id" \
  --build-arg "ICAO_NPM_REGISTRY=$build_npm_registry" \
  -t "$candidate_api" \
  -f "$source_dir/infra/ops/Dockerfile.api" \
  "$source_dir"
docker build \
  --build-arg "ICAO_NPM_REGISTRY=$build_npm_registry" \
  -t "$candidate_web" \
  -f "$source_dir/infra/ops/Dockerfile" \
  "$source_dir"

docker run --rm \
  --network supabase_default \
  --env-file "$runtime_env" \
  -e "API_RELEASE_ID=$release_id" \
  "$candidate_api" \
  node services/api/dist-ops/ops-config-preflight.js
docker run --rm \
  --network supabase_default \
  --env-file "$runtime_env" \
  "$candidate_api" \
  node services/api/scripts/migration-plan.mjs --require-current
ops_staff_readiness=$(docker run --rm \
  --network supabase_default \
  --env-file "$runtime_env" \
  "$candidate_api" \
  node services/api/scripts/verify-ops-production-readiness.mjs)
printf '%s\n' "$ops_staff_readiness" | grep -F '"status":"ready"' >/dev/null || {
  echo 'The read-only Ops staff readiness result is invalid.' >&2
  exit 1
}
active_admin_count=$(printf '%s\n' "$ops_staff_readiness" \
  | sed -n 's/.*"activeAdminCount":\([0-9][0-9]*\).*/\1/p')
case "$active_admin_count" in
  ''|*[!0-9]*) echo 'The active Ops administrator count is invalid.' >&2; exit 1 ;;
esac
[ "$active_admin_count" -ge 1 ] || {
  echo 'At least one non-disabled Ops administrator is required before cutover.' >&2
  exit 1
}
candidate_gateway=$release_dir/gateway-candidate.Caddyfile
python3 "$source_dir/infra/ops/prepare-gateway.py" \
  "$gateway_caddy" "$source_dir/infra/gateway/Caddyfile" "$candidate_gateway"
docker run --rm "$candidate_web" caddy validate --config /etc/caddy/Caddyfile
docker run --rm \
  --env-file "$gateway_env" \
  -v "$candidate_gateway:/etc/caddy/Caddyfile:ro" \
  caddy:2.11.4-alpine caddy validate --config /etc/caddy/Caddyfile
docker compose -f "$source_dir/infra/ops/docker-compose.runtime.yml" config >/dev/null
docker compose -f "$source_dir/infra/gateway/docker-compose.yml" config >/dev/null

backup_script=/opt/icao/runtime/backup-tools/current/backup-postgres.sh
restore_script=/opt/icao/runtime/backup-tools/current/restore-isolated.sh
[ -f "$backup_script" ] && [ ! -L "$backup_script" ] \
  && [ -f "$restore_script" ] && [ ! -L "$restore_script" ] || {
    echo 'Reviewed production backup and restore tools are missing.' >&2
    exit 1
  }
systemctl is-enabled icao-postgres-backup.timer >/dev/null
systemctl is-active icao-postgres-backup.timer >/dev/null
backup_path=$(/bin/sh "$backup_script")
case "$backup_path" in
  /opt/icao/backups/postgres/icao-*.dump) ;;
  *) echo 'Fresh backup path is invalid.' >&2; exit 1 ;;
esac
backup_name=$(basename "$backup_path")
(
  cd /opt/icao/backups/postgres
  sha256sum -c "$backup_name.sha256"
)
available_before_restore_kib=$(df -Pk /opt/icao | awk 'NR == 2 { print $4 }')
case "$available_before_restore_kib" in
  ''|*[!0-9]*) echo 'Pre-restore free-space evidence is invalid.' >&2; exit 1 ;;
esac
available_before_restore_bytes=$((available_before_restore_kib * 1024))
required_before_restore_bytes=$((production_database_bytes + 1024 * 1024 * 1024))
if [ "$available_before_restore_bytes" -lt "$required_before_restore_bytes" ]; then
  echo 'Insufficient ECS disk headroom for the isolated restore.' >&2
  exit 1
fi

attempt_id=$(date -u +%Y%m%dT%H%M%SZ)-$$
attempt_dir=$release_dir/attempts/$attempt_id
install -d -m 700 "$release_dir/attempts" "$attempt_dir"
load_ops_postgres_password
if ! EXPECT_USER_DATA=1 /bin/sh "$restore_script" "$backup_path" \
  > "$attempt_dir/preflight-restore.log"; then
  clear_ops_postgres_password
  echo 'The isolated production restore failed.' >&2
  exit 1
fi
clear_ops_postgres_password
grep -F isolated_restore_ok "$attempt_dir/preflight-restore.log" >/dev/null || {
  echo 'The isolated restore did not produce its success evidence.' >&2
  exit 1
}
chmod 600 "$attempt_dir/preflight-restore.log"

install -m 600 "$runtime_env" "$attempt_dir/runtime-env-before"
install -m 644 "$gateway_caddy" "$attempt_dir/gateway-caddy-before"
install -m 600 "$gateway_compose" "$attempt_dir/gateway-compose-before"
if [ -f "$runtime_compose" ]; then
  [ ! -L "$runtime_compose" ] || { echo 'Current Ops Compose path is unsafe.' >&2; exit 1; }
  install -m 600 "$runtime_compose" "$attempt_dir/ops-compose-before"
else
  : > "$attempt_dir/ops-compose-before.absent"
fi
printf '%s\n' "$release_id" > "$attempt_dir/release-id"
printf '%s\n' "$source_sha" > "$attempt_dir/source-sha"
printf '%s\n' "$ops_staff_readiness" > "$attempt_dir/ops-staff-readiness.json"

if [ "$api_exists" -eq 1 ]; then
  previous_release_id=$(read_env_value API_RELEASE_ID "$runtime_env")
  case "$previous_release_id" in
    ''|*[!A-Za-z0-9._-]*) echo 'The previous Ops release identity is invalid.' >&2; exit 1 ;;
  esac
  case "$previous_release_id" in
    development|test|unversioned) echo 'The previous Ops release identity is not production-safe.' >&2; exit 1 ;;
  esac
  curl -fsS --max-time 10 -D "$attempt_dir/previous-local-ready.headers" \
    -o "$attempt_dir/previous-local-ready.json" http://127.0.0.1:3102/health/ready
  curl -fsS --max-time 10 -D "$attempt_dir/previous-public-ready.headers" \
    -o "$attempt_dir/previous-public-ready.json" "https://$public_host/admin/health/ready"
  curl -fsS --max-time 10 -D "$attempt_dir/previous-public-web.headers" \
    -o "$attempt_dir/previous-public-web.html" "https://$public_host/admin/"
  previous_local_release_id=$(tr -d '\r' < "$attempt_dir/previous-local-ready.headers" \
    | awk 'tolower($1) == "x-icao-api-version:" { print $2; exit }')
  previous_public_release_id=$(tr -d '\r' < "$attempt_dir/previous-public-ready.headers" \
    | awk 'tolower($1) == "x-icao-api-version:" { print $2; exit }')
  [ "$previous_local_release_id" = "$previous_release_id" ] \
    && [ "$previous_public_release_id" = "$previous_release_id" ] || {
      echo 'The running Ops release identity does not match its production environment.' >&2
      exit 1
    }
  grep -F '"service":"icao-ops-api"' "$attempt_dir/previous-public-ready.json" >/dev/null
  grep -F '"database":"ok"' "$attempt_dir/previous-public-ready.json" >/dev/null
  grep -Fi 'strict-transport-security:' "$attempt_dir/previous-public-web.headers" >/dev/null
  grep -F '<title>听你五个 · 管理后台</title>' "$attempt_dir/previous-public-web.html" >/dev/null
  previous_api_tag=icao-ops-api:rollback-$release_id-$attempt_id
  previous_web_tag=icao-ops-web:rollback-$release_id-$attempt_id
  running_api_image=$(docker inspect -f '{{.Image}}' icao-ops-api)
  running_web_image=$(docker inspect -f '{{.Image}}' icao-ops-web)
  docker image inspect "$running_api_image" >/dev/null
  docker image inspect "$running_web_image" >/dev/null
  docker tag "$running_api_image" "$previous_api_tag"
  docker tag "$running_web_image" "$previous_web_tag"
  printf 'running\n' > "$attempt_dir/previous-state"
  printf '%s\n' "$previous_release_id" > "$attempt_dir/previous-release-id"
  printf '%s\n' "$previous_api_tag" > "$attempt_dir/previous-api-image-tag"
  printf '%s\n' "$previous_web_tag" > "$attempt_dir/previous-web-image-tag"
else
  printf 'absent\n' > "$attempt_dir/previous-state"
fi
ICAO_OPS_RELEASE_STATE_INTERNAL=1 \
  /bin/sh "$source_dir/infra/ops/release-state.sh" snapshot-previous "$attempt_dir"
chmod 600 "$attempt_dir"/*
(
  cd "$attempt_dir"
  set -- runtime-env-before gateway-caddy-before gateway-compose-before \
    previous-state previous-active-attempt release-id source-sha ops-staff-readiness.json
  if [ -f ops-compose-before ]; then set -- "$@" ops-compose-before; fi
  if [ -f ops-compose-before.absent ]; then set -- "$@" ops-compose-before.absent; fi
  if [ -f previous-api-image-tag ]; then
    set -- "$@" previous-api-image-tag previous-web-image-tag previous-release-id \
      previous-local-ready.headers previous-local-ready.json \
      previous-public-ready.headers previous-public-ready.json \
      previous-public-web.headers previous-public-web.html
  fi
  sha256sum "$@" > snapshot-checksums.sha256
)
chmod 600 "$attempt_dir/snapshot-checksums.sha256"
ICAO_OPS_RELEASE_STATE_INTERNAL=1 \
  /bin/sh "$source_dir/infra/ops/release-state.sh" activate "$attempt_dir"
rollback_armed=1

candidate_runtime_env=$attempt_dir/runtime-env-candidate
awk -v release_id="$release_id" '
  BEGIN { written = 0 }
  /^API_RELEASE_ID=/ {
    if (!written) print "API_RELEASE_ID=" release_id
    written = 1
    next
  }
  { print }
  END { if (!written) print "API_RELEASE_ID=" release_id }
' "$runtime_env" > "$candidate_runtime_env"
chmod 600 "$candidate_runtime_env"
install -d -m 700 "$runtime_root"
install -m 600 "$candidate_runtime_env" "$runtime_env"
install -m 600 "$source_dir/infra/ops/docker-compose.runtime.yml" "$runtime_compose"
install -m 644 "$candidate_gateway" "$gateway_caddy"
install -m 600 "$source_dir/infra/gateway/docker-compose.yml" "$gateway_compose"

docker tag "$candidate_api" icao-ops-api:production
docker tag "$candidate_web" icao-ops-web:production
docker compose -f "$runtime_compose" up -d --force-recreate

local_ready=0
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 -D "$attempt_dir/local-ready.headers" \
    -o "$attempt_dir/local-ready.json" http://127.0.0.1:3102/health/ready \
    && curl -fsS --max-time 5 -o "$attempt_dir/local-web.html" http://127.0.0.1:4180/; then
    local_ready=1
    break
  fi
  sleep 2
done
[ "$local_ready" -eq 1 ] || { echo 'Candidate Ops containers did not become ready.' >&2; exit 1; }
grep -F '"service":"icao-ops-api"' "$attempt_dir/local-ready.json" >/dev/null
grep -F '"database":"ok"' "$attempt_dir/local-ready.json" >/dev/null
local_release_id=$(tr -d '\r' < "$attempt_dir/local-ready.headers" \
  | awk 'tolower($1) == "x-icao-api-version:" { print $2; exit }')
[ "$local_release_id" = "$release_id" ] || { echo 'Local Ops release identity mismatch.' >&2; exit 1; }
grep -F '<title>听你五个 · 管理后台</title>' "$attempt_dir/local-web.html" >/dev/null
ss -ltnH | awk '{ print $4 }' | grep -Fx '127.0.0.1:3102' >/dev/null
ss -ltnH | awk '{ print $4 }' | grep -Fx '127.0.0.1:4180' >/dev/null

docker compose -f "$gateway_compose" up -d --force-recreate caddy
public_ready=0
for attempt in $(seq 1 60); do
  if curl -fsS --max-time 10 -D "$attempt_dir/public-ready.headers" \
    -o "$attempt_dir/public-ready.json" "https://$public_host/admin/health/ready" \
    && curl -fsS --max-time 10 -D "$attempt_dir/public-web.headers" \
    -o "$attempt_dir/public-web.html" "https://$public_host/admin/" \
    && curl -fsS --max-time 10 https://api.readyoufife.com/health/ready >/dev/null; then
    public_ready=1
    break
  fi
  sleep 2
done
[ "$public_ready" -eq 1 ] || { echo 'Public Ops TLS or health verification failed.' >&2; exit 1; }
grep -F '"service":"icao-ops-api"' "$attempt_dir/public-ready.json" >/dev/null
grep -F '"database":"ok"' "$attempt_dir/public-ready.json" >/dev/null
public_release_id=$(tr -d '\r' < "$attempt_dir/public-ready.headers" \
  | awk 'tolower($1) == "x-icao-api-version:" { print $2; exit }')
[ "$public_release_id" = "$release_id" ] || { echo 'Public Ops release identity mismatch.' >&2; exit 1; }
grep -Fi 'strict-transport-security:' "$attempt_dir/public-web.headers" >/dev/null
grep -F '<title>听你五个 · 管理后台</title>' "$attempt_dir/public-web.html" >/dev/null
chmod 600 "$attempt_dir"/*

api_image_id=$(docker inspect -f '{{.Image}}' icao-ops-api)
web_image_id=$(docker inspect -f '{{.Image}}' icao-ops-web)
gateway_config_sha=$(sha256sum "$gateway_caddy" | awk '{ print $1 }')
deployed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
evidence_tmp=$release_dir/deployment-evidence.json.tmp.$$
printf '{\n  "status": "deployed",\n  "releaseId": "%s",\n  "sourceSha": "%s",\n  "archiveSha256": "%s",\n  "deployedAt": "%s",\n  "hostname": "%s",\n  "backup": "%s",\n  "isolatedRestore": "verified",\n  "migrationLedger": "current-read-only",\n  "opsStaffReadiness": "verified-read-only",\n  "activeAdminCount": %s,\n  "productionDatabaseBytes": %s,\n  "availableBeforeBuildBytes": %s,\n  "requiredBeforeBuildBytes": %s,\n  "availableBeforeRestoreBytes": %s,\n  "requiredBeforeRestoreBytes": %s,\n  "previousState": "%s",\n  "opsApiImageId": "%s",\n  "opsWebImageId": "%s",\n  "gatewayConfigSha256": "%s",\n  "localHealth": "verified",\n  "publicTlsAndHealth": "verified",\n  "ordinaryApiIsolation": "verified",\n  "rollbackSnapshot": "%s"\n}\n' \
  "$release_id" "$source_sha" "$archive_sha" "$deployed_at" "$public_host" \
  "$backup_name" "$active_admin_count" "$production_database_bytes" "$available_before_build_bytes" \
  "$required_before_build_bytes" "$available_before_restore_bytes" \
  "$required_before_restore_bytes" "$(cat "$attempt_dir/previous-state")" "$api_image_id" "$web_image_id" \
  "$gateway_config_sha" "$attempt_dir" > "$evidence_tmp"
chmod 600 "$evidence_tmp"
ICAO_OPS_RELEASE_STATE_INTERNAL=1 \
  /bin/sh "$source_dir/infra/ops/release-state.sh" mark-deployed "$attempt_dir"
mv "$evidence_tmp" "$release_dir/deployment-evidence.json"

committed=1
echo "Ops production deployment verified: release=$release_id source=$source_sha"
REMOTE_DEPLOY

local_evidence_dir=$PROJECT_ROOT/.generated/ops-release/$RELEASE_ID
mkdir -p "$local_evidence_dir"
remote_release=/opt/icao/runtime/releases/ops-$RELEASE_ID
scp -i "$SSH_KEY" -q \
  "$ECS_USER@$ECS_HOST:$remote_release/deployment-evidence.json" \
  "$local_evidence_dir/deployment-evidence.json"
chmod 600 "$local_evidence_dir/deployment-evidence.json"

echo "Ops deployment evidence copied to $local_evidence_dir/deployment-evidence.json"
echo 'No database migration, EdgeOne deployment, Vercel action, or staff provisioning was performed by this command.'
