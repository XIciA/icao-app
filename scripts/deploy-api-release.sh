#!/bin/sh

set -eu

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
  patches packages/contracts services/api content/vocabulary infra/api \
  | COPYFILE_DISABLE=1 tar --null -T - -czf "$ARCHIVE"
shasum -a 256 "$ARCHIVE" > "$ARCHIVE.sha256"

REMOTE_RELEASE=/opt/icao/runtime/releases/api-$RELEASE_ID
REMOTE_ARCHIVE=$REMOTE_RELEASE/source.tar.gz
ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" "mkdir -p '$REMOTE_RELEASE'"
scp -i "$SSH_KEY" -q "$ARCHIVE" "$ECS_USER@$ECS_HOST:$REMOTE_ARCHIVE"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- "$RELEASE_ID" "$REMOTE_RELEASE" "$BUILD_NPM_REGISTRY" <<'REMOTE'
set -eu
release_id=$1
release_dir=$2
build_npm_registry=$3
source_dir=$release_dir/source
rollback_image=icao-api:rollback-$release_id
candidate_image=icao-api:candidate-$release_id
backup_dir=/opt/icao/backups/api-$release_id
runtime_compose=/opt/icao/runtime/api/docker-compose.yml
runtime_env=/opt/icao/runtime/api/.env

rm -rf "$source_dir"
mkdir -p "$source_dir" "$backup_dir"
tar -xzf "$release_dir/source.tar.gz" -C "$source_dir"
if [ -d /opt/icao/runtime/source ]; then
  tar -czf "$backup_dir/source-before.tar.gz" -C /opt/icao/runtime/source .
fi
if [ -f "$runtime_compose" ]; then cp "$runtime_compose" "$backup_dir/docker-compose-before.yml"; fi
if [ ! -f "$runtime_env" ]; then
  echo 'Production API environment file is missing.' >&2
  exit 1
fi
cp -p "$runtime_env" "$backup_dir/runtime-env-before"
install -m 600 "$source_dir/infra/api/docker-compose.runtime.yml" "$runtime_compose"
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

if ! docker run --rm \
  --network supabase_default \
  --env-file "$runtime_env" \
  -e "API_RELEASE_ID=$release_id" \
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
  --env-file "$runtime_env" \
  "$candidate_image" \
  node services/api/scripts/migration-plan.mjs --require-current; then
  echo 'Production schema is not current; candidate API deployment was blocked before cutover.' >&2
  exit 1
fi

candidate_runtime_env=$backup_dir/runtime-env-candidate
umask 077
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
install -m 600 "$candidate_runtime_env" "$runtime_env"

docker tag "$candidate_image" icao-api:phase2a

rollback() {
  docker tag "$rollback_image" icao-api:phase2a
  install -m 600 "$backup_dir/runtime-env-before" "$runtime_env"
  if [ -f "$backup_dir/docker-compose-before.yml" ]; then
    install -m 600 "$backup_dir/docker-compose-before.yml" "$runtime_compose"
  fi
  docker compose -f "$runtime_compose" up -d --force-recreate api
}

if ! docker compose -f "$runtime_compose" up -d --force-recreate api; then
  rollback
  exit 1
fi

ready=0
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3101/health/ready >/dev/null; then ready=1; break; fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  rollback
  exit 1
fi

if ! docker exec -e ICAO_LIVE_VERIFY_MODE=readiness icao-api node services/api/scripts/verify-live.mjs; then
  rollback
  exit 1
fi

active_release_id=$(curl -fsS -D - -o /dev/null http://127.0.0.1:3101/health/ready \
  | tr -d '\r' \
  | awk 'tolower($1) == "x-icao-api-version:" { print $2; exit }')
if [ "$active_release_id" != "$release_id" ]; then
  echo 'Candidate API release identity does not match the active readiness endpoint.' >&2
  rollback
  exit 1
fi

rm -rf /opt/icao/runtime/source.next
cp -a "$source_dir" /opt/icao/runtime/source.next
if [ -d /opt/icao/runtime/source ]; then mv /opt/icao/runtime/source "$backup_dir/source-directory-before"; fi
mv /opt/icao/runtime/source.next /opt/icao/runtime/source
curl -fsS http://127.0.0.1:3101/health/ready
REMOTE

echo "API deployment and non-mutating readiness verification completed: $DISPLAY_VERSION"
echo 'Authenticated phone/social account verification is separate and non-provisioning:'
echo "Run services/api/scripts/verify-account-live.mjs with ICAO_API_URL=$API_URL and an ephemeral ICAO_AUTH_ACCESS_TOKEN environment variable."
