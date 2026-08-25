#!/bin/sh

set -eu
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"

CURRENT_RELEASE=$PROJECT_ROOT/.generated/release/current.json
if [ -z "${ICAO_API_RELEASE_ID:-}" ] && [ ! -f "$CURRENT_RELEASE" ]; then
  echo 'Current release metadata is missing.' >&2
  exit 1
fi

SOURCE_ROOT=${ICAO_API_RELEASE_SOURCE_ROOT:-$PROJECT_ROOT}
SOURCE_ROOT=$(CDPATH= cd -- "$SOURCE_ROOT" && pwd)
SOURCE_GIT_ROOT=$(git -C "$SOURCE_ROOT" rev-parse --show-toplevel 2>/dev/null || true)
if [ "$SOURCE_GIT_ROOT" != "$SOURCE_ROOT" ]; then
  echo 'ICAO_API_RELEASE_SOURCE_ROOT must be the root of a Git worktree.' >&2
  exit 1
fi

node "$SOURCE_ROOT/tools/check-mainline-release.mjs" --root "$SOURCE_ROOT"

CONTENT_SIGNING_PRIVATE_KEY_PATH=${ICAO_CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY_PATH:-}
if [ -z "$CONTENT_SIGNING_PRIVATE_KEY_PATH" ]; then
  echo 'ICAO_CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY_PATH must point to the protected production Ed25519 private key.' >&2
  exit 1
fi
node "$SOURCE_ROOT/tools/content-credential-signing-key.mjs" verify \
  --private-key-path "$CONTENT_SIGNING_PRIVATE_KEY_PATH"

for required_command in git node openssl scp shasum ssh; do
  require_command "$required_command"
done

load_release_runtime

BUILD_NPM_REGISTRY=${ICAO_API_BUILD_NPM_REGISTRY:-https://registry.npmmirror.com}
require_public_https_url ICAO_API_BUILD_NPM_REGISTRY "$BUILD_NPM_REGISTRY"

DISPLAY_VERSION=${ICAO_API_RELEASE_ID:-$(node -p "require('$CURRENT_RELEASE').displayVersion")}
case "$DISPLAY_VERSION" in
  ''|*[!A-Za-z0-9._-]*)
    echo 'ICAO_API_RELEASE_ID must contain only letters, numbers, dots, underscores, or hyphens.' >&2
    exit 1
    ;;
esac
RELEASE_ID=$DISPLAY_VERSION
ARCHIVE_DIR=$PROJECT_ROOT/.generated/api-release/$RELEASE_ID
ARCHIVE=$ARCHIVE_DIR/source.tar.gz
mkdir -p "$ARCHIVE_DIR"

cd "$SOURCE_ROOT"
git ls-files -co --exclude-standard -z -- \
  package.json pnpm-lock.yaml pnpm-workspace.yaml \
  patches modules/icao-distribution-environment packages/contracts services/api \
  content/vocabulary infra/api infra/backup \
  | COPYFILE_DISABLE=1 tar --null -T - -czf "$ARCHIVE"
shasum -a 256 "$ARCHIVE" > "$ARCHIVE.sha256"

CONTENT_KEY_UPLOAD_TOKEN=$(openssl rand -hex 16)
case "$CONTENT_KEY_UPLOAD_TOKEN" in
  ''|*[!A-Fa-f0-9]*) echo 'The content signing-key upload token is invalid.' >&2; exit 1 ;;
esac
[ "${#CONTENT_KEY_UPLOAD_TOKEN}" -eq 32 ] || {
  echo 'The content signing-key upload token has an invalid length.' >&2
  exit 1
}
CONTENT_KEY_PROVISION_SCRIPT=$SOURCE_ROOT/infra/api/content-signing-key-provision.sh
REMOTE_RELEASE_ROOT=/opt/icao/runtime/releases
REMOTE_API_RELEASE_LOCK=/run/lock/icao-api-release.lock
REMOTE_CONTENT_KEY_STAGE_ARMED=1
cleanup_remote_content_key_stage() {
  cleanup_status=$?
  trap - EXIT HUP INT TERM
  if [ "$REMOTE_CONTENT_KEY_STAGE_ARMED" = 1 ]; then
    if ! ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- \
      cleanup "$RELEASE_ID" "$CONTENT_KEY_UPLOAD_TOKEN" "$REMOTE_RELEASE_ROOT" 0 \
      "$REMOTE_API_RELEASE_LOCK" < "$CONTENT_KEY_PROVISION_SCRIPT" >/dev/null; then
      echo 'Remote content signing-key staging cleanup failed.' >&2
      cleanup_status=1
    fi
  fi
  exit "$cleanup_status"
}
trap cleanup_remote_content_key_stage EXIT
trap 'exit 1' HUP INT TERM

REMOTE_CONTENT_SIGNING_PRIVATE_KEY=$(
  ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- \
    stage "$RELEASE_ID" "$CONTENT_KEY_UPLOAD_TOKEN" "$REMOTE_RELEASE_ROOT" 0 \
    "$REMOTE_API_RELEASE_LOCK" < "$CONTENT_KEY_PROVISION_SCRIPT"
)
expected_remote_content_key=$REMOTE_RELEASE_ROOT/api-secret-uploads/stage-$RELEASE_ID-$CONTENT_KEY_UPLOAD_TOKEN/content-credential-signing-private-key.pem
[ "$REMOTE_CONTENT_SIGNING_PRIVATE_KEY" = "$expected_remote_content_key" ] || {
  echo 'Remote content signing-key staging returned an unexpected path.' >&2
  exit 1
}
scp -i "$SSH_KEY" -q "$CONTENT_SIGNING_PRIVATE_KEY_PATH" \
  "$ECS_USER@$ECS_HOST:$REMOTE_CONTENT_SIGNING_PRIVATE_KEY"
ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- \
  validate "$RELEASE_ID" "$CONTENT_KEY_UPLOAD_TOKEN" "$REMOTE_RELEASE_ROOT" 0 \
  "$REMOTE_API_RELEASE_LOCK" < "$CONTENT_KEY_PROVISION_SCRIPT"

REMOTE_RELEASE=/opt/icao/runtime/releases/api-$RELEASE_ID
REMOTE_ARCHIVE=$REMOTE_RELEASE/source.tar.gz
ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" "mkdir -p '$REMOTE_RELEASE'"
scp -i "$SSH_KEY" -q "$ARCHIVE" "$ECS_USER@$ECS_HOST:$REMOTE_ARCHIVE"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- \
  "$RELEASE_ID" "$REMOTE_RELEASE" "$BUILD_NPM_REGISTRY" "$CONTENT_KEY_UPLOAD_TOKEN" <<'REMOTE'
set -eu
umask 077
release_id=$1
release_dir=$2
build_npm_registry=$3
content_key_upload_token=$4
exec 8<>/run/lock/icao-production-release-change.lock
if ! flock -n 8; then
  echo 'A production database migration or release change is already running.' >&2
  exit 1
fi
source_dir=$release_dir/source
rollback_image=icao-api:rollback-$release_id
candidate_image=icao-api:candidate-$release_id
backup_dir=/opt/icao/backups/api-$release_id
runtime_compose=/opt/icao/runtime/api/docker-compose.yml
runtime_env=/opt/icao/runtime/api/.env
release_root=/opt/icao/runtime/releases
release_lock=/run/lock/icao-api-release.lock
expected_owner=0

command -v flock >/dev/null 2>&1 || {
  echo 'The API release lock dependency is missing.' >&2
  exit 1
}
[ ! -L "$release_lock" ] || {
  echo 'The API release lock must not be a symbolic link.' >&2
  exit 1
}
exec 9>"$release_lock"
flock -n 9 || {
  echo 'Another API release or content-key provisioning operation is active.' >&2
  exit 1
}

rm -rf "$source_dir"
mkdir -p "$source_dir"
tar -xzf "$release_dir/source.tar.gz" -C "$source_dir"
ICAO_CONTENT_KEY_PROVISION_LIBRARY=1
. "$source_dir/infra/api/content-signing-key-provision.sh"
unset ICAO_CONTENT_KEY_PROVISION_LIBRARY
content_key_cli_boundary "$release_root" "$expected_owner" "$release_lock"
[ -f "$release_lock" ] && [ ! -L "$release_lock" ] \
  && [ "$(content_key_read_uid "$release_lock")" = "$expected_owner" ] || {
  echo 'The acquired API release lock failed owner or file-type revalidation.' >&2
  exit 1
}
content_key_validate_stage \
  "$release_root" "$release_id" "$content_key_upload_token" "$expected_owner" pem absent
content_key_validate_runtime_env "$runtime_env" "$expected_owner"
content_key_set_stage_paths "$release_root" "$release_id" "$content_key_upload_token"
candidate_runtime_env=$CONTENT_KEY_CANDIDATE_ENV

[ ! -e "$backup_dir" ] && [ ! -L "$backup_dir" ] || {
  echo 'The API release backup directory already exists.' >&2
  exit 1
}
mkdir -m 700 "$backup_dir"
content_key_validate_backup_directory "$backup_dir" "$expected_owner"

release_succeeded=0
runtime_env_update_armed=0
cutover_started=0
runtime_source_existed=0
cleanup_release() {
  cleanup_status=$?
  trap - EXIT HUP INT TERM
  if [ "$release_succeeded" != 1 ] && [ "$cutover_started" = 1 ]; then
    if content_key_rollback_release \
      "$rollback_image" "$runtime_env" "$backup_dir/runtime-env-before" "$expected_owner" \
      "$runtime_compose" "$backup_dir/docker-compose-before.yml" \
      /opt/icao/runtime/source "$backup_dir/source-directory-before" \
      /opt/icao/runtime/source.next "$running_release_id" "$runtime_source_existed"; then
      cutover_started=0
      runtime_env_update_armed=0
    else
      echo 'CRITICAL: the failed API cutover could not be fully rolled back and verified.' >&2
      cleanup_status=1
    fi
  elif [ "$release_succeeded" != 1 ] && [ "$runtime_env_update_armed" = 1 ] \
    && [ -f "$backup_dir/runtime-env-before" ]; then
    if ! content_key_restore_runtime_env \
      "$backup_dir/runtime-env-before" "$runtime_env" "$expected_owner"; then
      echo 'Failed to restore the original API runtime environment.' >&2
      cleanup_status=1
    fi
  fi
  if ! content_key_cleanup_stage \
    "$release_root" "$release_id" "$content_key_upload_token" "$expected_owner"; then
    echo 'Failed to remove the staged content signing key.' >&2
    cleanup_status=1
  fi
  exit "$cleanup_status"
}
trap cleanup_release EXIT
trap 'exit 1' HUP INT TERM

if [ -d /opt/icao/runtime/source ]; then
  tar -czf "$backup_dir/source-before.tar.gz" -C /opt/icao/runtime/source .
  runtime_source_existed=1
fi
if [ -f "$runtime_compose" ] && [ ! -L "$runtime_compose" ]; then
  cp "$runtime_compose" "$backup_dir/docker-compose-before.yml"
  chmod 600 "$backup_dir/docker-compose-before.yml"
else
  echo 'The production API Compose file is not a real regular file.' >&2
  exit 1
fi
running_image=$(docker inspect -f '{{.Image}}' icao-api)
docker image inspect "$running_image" >/dev/null
docker tag "$running_image" "$rollback_image"
running_release_id=$(docker exec icao-api sh -lc 'printf "%s" "${API_RELEASE_ID:-unversioned}"')
case "$running_release_id" in
  ''|*[!A-Za-z0-9._-]*)
    echo 'The running API release ID is invalid; rollback identity cannot be preserved.' >&2
    exit 1
    ;;
esac

docker build \
  --build-arg "ICAO_API_RELEASE_ID=$release_id" \
  --build-arg "ICAO_NPM_REGISTRY=$build_npm_registry" \
  -t "$candidate_image" \
  -f "$source_dir/infra/api/Dockerfile" \
  "$source_dir"

content_key_prepare_candidate_env \
  "$release_root" "$release_id" "$content_key_upload_token" "$expected_owner" "$runtime_env"
content_key_validate_stage \
  "$release_root" "$release_id" "$content_key_upload_token" "$expected_owner" pem required

if ! docker run --rm \
  --network supabase_default \
  --env-file "$candidate_runtime_env" \
  "$candidate_image" \
  node services/api/dist/src/config-preflight.js; then
  echo 'Candidate API production configuration is incomplete; deployment was blocked before cutover.' >&2
  exit 1
fi

# The candidate reads the real migration ledger in an explicitly read-only
# transaction. It must never replace the running API while any repository
# migration is pending or the production ledger has drifted.
if ! docker run --rm \
  --network supabase_default \
  --env-file "$candidate_runtime_env" \
  "$candidate_image" \
  node services/api/scripts/migration-plan.mjs --require-current; then
  echo 'Production schema is not current; candidate API deployment was blocked before cutover.' >&2
  exit 1
fi

runtime_env_update_armed=1
content_key_install_candidate_env \
  "$release_root" "$release_id" "$content_key_upload_token" "$expected_owner" \
  "$runtime_env" "$backup_dir"
cutover_started=1
install -m 600 "$source_dir/infra/api/docker-compose.runtime.yml" "$runtime_compose"

docker tag "$candidate_image" icao-api:phase2a

if ! docker compose -f "$runtime_compose" up -d --force-recreate api; then
  exit 1
fi

ready=0
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3101/health/ready >/dev/null; then ready=1; break; fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  exit 1
fi

if ! docker exec -e ICAO_LIVE_VERIFY_MODE=readiness icao-api node services/api/scripts/verify-live.mjs; then
  exit 1
fi

active_release_id=$(curl -fsS -D - -o /dev/null http://127.0.0.1:3101/health/ready \
  | tr -d '\r' \
  | awk 'tolower($1) == "x-icao-api-version:" { print $2; exit }')
if [ "$active_release_id" != "$release_id" ]; then
  echo 'Candidate API release identity does not match the active readiness endpoint.' >&2
  exit 1
fi

rm -rf /opt/icao/runtime/source.next
cp -a "$source_dir" /opt/icao/runtime/source.next
if [ -d /opt/icao/runtime/source ]; then mv /opt/icao/runtime/source "$backup_dir/source-directory-before"; fi
mv /opt/icao/runtime/source.next /opt/icao/runtime/source
curl -fsS http://127.0.0.1:3101/health/ready
release_succeeded=1
REMOTE

REMOTE_CONTENT_KEY_STAGE_ARMED=0

echo "API deployment and non-mutating readiness verification completed: $DISPLAY_VERSION"
echo 'Authenticated phone/social account verification is separate and non-provisioning:'
echo "Run services/api/scripts/verify-account-live.mjs with ICAO_API_URL=$API_URL and an ephemeral ICAO_AUTH_ACCESS_TOKEN environment variable."
