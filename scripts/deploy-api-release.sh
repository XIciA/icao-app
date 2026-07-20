#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"
load_release_runtime

CURRENT_MANIFEST=$PROJECT_ROOT/.generated/release/current-manifest.json
if [ ! -f "$CURRENT_MANIFEST" ]; then
  echo 'Release manifest is missing.' >&2
  exit 1
fi

DISPLAY_VERSION=$(node -p "require('$CURRENT_MANIFEST').displayVersion")
RELEASE_ID=$(printf '%s' "$DISPLAY_VERSION" | tr -cd 'A-Za-z0-9._-')
ARCHIVE_DIR=$PROJECT_ROOT/.generated/api-release/$RELEASE_ID
ARCHIVE=$ARCHIVE_DIR/source.tar.gz
mkdir -p "$ARCHIVE_DIR"

cd "$PROJECT_ROOT"
git ls-files -co --exclude-standard -z -- \
  package.json pnpm-lock.yaml pnpm-workspace.yaml \
  patches packages/contracts services/api content/vocabulary infra/api \
  | tar --null -T - -czf "$ARCHIVE"
shasum -a 256 "$ARCHIVE" > "$ARCHIVE.sha256"

REMOTE_RELEASE=/opt/icao/runtime/releases/api-$RELEASE_ID
REMOTE_ARCHIVE=$REMOTE_RELEASE/source.tar.gz
ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" "mkdir -p '$REMOTE_RELEASE'"
scp -i "$SSH_KEY" -q "$ARCHIVE" "$ECS_USER@$ECS_HOST:$REMOTE_ARCHIVE"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- "$RELEASE_ID" "$REMOTE_RELEASE" <<'REMOTE'
set -eu
release_id=$1
release_dir=$2
source_dir=$release_dir/source
rollback_image=icao-api:rollback-$release_id
candidate_image=icao-api:candidate-$release_id
backup_dir=/opt/icao/backups/api-$release_id
runtime_compose=/opt/icao/runtime/api/docker-compose.yml

mkdir -p "$source_dir" "$backup_dir"
tar -xzf "$release_dir/source.tar.gz" -C "$source_dir"
if [ -d /opt/icao/runtime/source ]; then
  tar -czf "$backup_dir/source-before.tar.gz" -C /opt/icao/runtime/source .
fi
if [ -f "$runtime_compose" ]; then cp "$runtime_compose" "$backup_dir/docker-compose-before.yml"; fi
install -m 600 "$source_dir/infra/api/docker-compose.runtime.yml" "$runtime_compose"
docker image inspect icao-api:phase2a >/dev/null
docker tag icao-api:phase2a "$rollback_image"

docker build -t "$candidate_image" -f "$source_dir/infra/api/Dockerfile" "$source_dir"
docker tag "$candidate_image" icao-api:phase2a

rollback() {
  docker tag "$rollback_image" icao-api:phase2a
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

if ! docker exec icao-api node services/api/scripts/verify-live.mjs; then
  rollback
  exit 1
fi

rm -rf /opt/icao/runtime/source.next
cp -a "$source_dir" /opt/icao/runtime/source.next
if [ -d /opt/icao/runtime/source ]; then mv /opt/icao/runtime/source "$backup_dir/source-directory-before"; fi
mv /opt/icao/runtime/source.next /opt/icao/runtime/source
curl -fsS http://127.0.0.1:3101/health/ready
REMOTE

echo "API deployment and live verification completed: $DISPLAY_VERSION"
