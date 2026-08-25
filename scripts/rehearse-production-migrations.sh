#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"

SOURCE_ROOT=${ICAO_MIGRATION_REHEARSAL_SOURCE_ROOT:-$PROJECT_ROOT}
SOURCE_ROOT=$(CDPATH= cd -- "$SOURCE_ROOT" && pwd)
SOURCE_GIT_ROOT=$(git -C "$SOURCE_ROOT" rev-parse --show-toplevel 2>/dev/null || true)
if [ "$SOURCE_GIT_ROOT" != "$SOURCE_ROOT" ]; then
  echo 'ICAO_MIGRATION_REHEARSAL_SOURCE_ROOT must be the root of a Git worktree.' >&2
  exit 1
fi
node "$SOURCE_ROOT/tools/check-mainline-release.mjs" --root "$SOURCE_ROOT"

require_command ssh
require_command scp
require_command gzip
require_command mktemp
require_command openssl
require_command shasum

ECS_HOST=${ICAO_ECS_HOST:-47.108.90.19}
ECS_USER=${ICAO_ECS_USER:-root}
SSH_KEY=${ICAO_ECS_SSH_KEY:-${HOME:?}/.ssh/icao_app_codex}
BUILD_NPM_REGISTRY=${ICAO_API_BUILD_NPM_REGISTRY:-https://registry.npmmirror.com}
require_public_https_url ICAO_API_BUILD_NPM_REGISTRY "$BUILD_NPM_REGISTRY"
if [ ! -r "$SSH_KEY" ]; then
  echo "Project SSH key is not readable: $SSH_KEY" >&2
  exit 1
fi

SOURCE_SHA=$(git -C "$SOURCE_ROOT" rev-parse HEAD)
SOURCE_ID=$(printf '%.12s' "$SOURCE_SHA")
UPLOAD_TOKEN=$(openssl rand -hex 16)
case "$SOURCE_SHA:$UPLOAD_TOKEN" in
  *[!A-Fa-f0-9:]*) echo 'Migration rehearsal source or upload identity is invalid.' >&2; exit 1 ;;
esac

LOCAL_DIR=$(mktemp -d "${TMPDIR:-/tmp}/icao-migration-rehearsal.XXXXXX")
ARCHIVE=$LOCAL_DIR/source.tar.gz
cleanup_local() {
  rm -rf "$LOCAL_DIR"
}
trap cleanup_local EXIT
trap 'exit 1' HUP INT TERM

(
  cd "$SOURCE_ROOT"
  git archive --format=tar HEAD \
    package.json pnpm-lock.yaml pnpm-workspace.yaml patches packages/contracts \
    services/api content/vocabulary infra/api \
    | gzip -n > "$ARCHIVE"
)
ARCHIVE_SHA=$(shasum -a 256 "$ARCHIVE" | awk '{ print $1 }')

REMOTE_ROOT=/opt/icao/runtime/migration-rehearsals
REMOTE_UPLOAD=$REMOTE_ROOT/uploads/source-$SOURCE_ID-$UPLOAD_TOKEN.tar.gz
REMOTE_CHECKSUM=$REMOTE_UPLOAD.sha256
printf '%s  %s\n' "$ARCHIVE_SHA" "$(basename "$REMOTE_UPLOAD")" > "$ARCHIVE.sha256"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" \
  "install -d -m 700 '$REMOTE_ROOT' '$REMOTE_ROOT/uploads' '$REMOTE_ROOT/evidence'"
scp -i "$SSH_KEY" -q "$ARCHIVE" "$ECS_USER@$ECS_HOST:$REMOTE_UPLOAD"
scp -i "$SSH_KEY" -q "$ARCHIVE.sha256" "$ECS_USER@$ECS_HOST:$REMOTE_CHECKSUM"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- \
  "$SOURCE_SHA" "$ARCHIVE_SHA" "$UPLOAD_TOKEN" "${ICAO_REHEARSAL_BACKUP_NAME:-}" \
  "$BUILD_NPM_REGISTRY" <<'REMOTE'
set -eu
umask 077

source_sha=$1
archive_sha=$2
upload_token=$3
requested_backup=$4
build_npm_registry=$5
source_id=$(printf '%.12s' "$source_sha")
root=/opt/icao/runtime/migration-rehearsals
upload=$root/uploads/source-$source_id-$upload_token.tar.gz
checksum=$upload.sha256
work_dir=$root/.work-$source_id-$upload_token
evidence_dir=$root/evidence
database_name=icao_rehearsal_${source_id}_${upload_token}
image=icao-api:migration-rehearsal-$source_id
runtime_env=/opt/icao/runtime/api/.env
database_env=$work_dir/database.env
database_created=0

case "$source_sha:$archive_sha:$upload_token" in
  *[!A-Fa-f0-9:]*) echo 'remote migration rehearsal identity is invalid' >&2; exit 1 ;;
esac
case "$database_name" in
  icao_rehearsal_[a-fA-F0-9_]*) ;;
  *) echo 'isolated database name escaped its protected prefix' >&2; exit 1 ;;
esac
case "$work_dir" in
  "$root"/.work-*) ;;
  *) echo 'migration rehearsal work path escaped its root' >&2; exit 1 ;;
esac

exec 9>/run/lock/icao-production-migration-rehearsal.lock
if ! flock -n 9; then
  echo 'another production migration rehearsal is already running' >&2
  exit 1
fi

cleanup() (
  set +e
  if [ "$database_created" = 1 ]; then
    POSTGRES_PASSWORD=$(docker exec supabase-db printenv POSTGRES_PASSWORD)
    export POSTGRES_PASSWORD
    docker run --rm --network supabase_default \
      -e PGPASSWORD -e RESTORE_DB_NAME="$database_name" \
      supabase/postgres:17.6.1.136 \
      sh -ec 'dropdb -h db -U supabase_admin --if-exists --force "$RESTORE_DB_NAME"'
    unset POSTGRES_PASSWORD
  fi
  rm -rf "$work_dir"
  rm -f "$upload" "$checksum"
  docker image rm "$image" >/dev/null 2>&1 || true
)
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

expected_checksum_line="$archive_sha  $(basename "$upload")"
actual_checksum_line=$(cat "$checksum")
test "$actual_checksum_line" = "$expected_checksum_line"
(
  cd "$(dirname "$upload")"
  sha256sum -c "$(basename "$checksum")"
)

if [ -n "$requested_backup" ]; then
  case "$requested_backup" in
    *[!A-Za-z0-9._-]*|*..*)
      echo 'ICAO_REHEARSAL_BACKUP_NAME contains unsafe characters.' >&2
      exit 1
      ;;
    icao-*.dump) ;;
    *) echo 'ICAO_REHEARSAL_BACKUP_NAME must be a backup basename.' >&2; exit 1 ;;
  esac
  backup=/opt/icao/backups/postgres/$requested_backup
else
  backup=$(find /opt/icao/backups/postgres -maxdepth 1 -type f -name 'icao-*.dump' -print | sort | tail -n 1)
fi
test -n "$backup"
test -f "$backup"
backup_name=$(basename "$backup")
(
  cd /opt/icao/backups/postgres
  sha256sum -c "$backup_name.sha256"
)
backup_sha=$(awk 'NR == 1 { print $1 }' "$backup.sha256")
case "$backup_sha" in
  ''|*[!A-Fa-f0-9]*) echo 'production backup SHA is invalid' >&2; exit 1 ;;
esac

test -f "$runtime_env"
install -d -m 700 "$work_dir"
tar -xzf "$upload" -C "$work_dir"
docker build \
  --build-arg "ICAO_API_RELEASE_ID=migration-rehearsal-$source_id" \
  --build-arg "ICAO_NPM_REGISTRY=$build_npm_registry" \
  -t "$image" -f "$work_dir/infra/api/Dockerfile" "$work_dir"

POSTGRES_PASSWORD=$(docker exec supabase-db printenv POSTGRES_PASSWORD)
test -n "$POSTGRES_PASSWORD"
export POSTGRES_PASSWORD
docker run --rm --network supabase_default \
  -e PGPASSWORD -e RESTORE_DB_NAME="$database_name" \
  supabase/postgres:17.6.1.136 \
  sh -ec 'createdb -h db -U supabase_admin "$RESTORE_DB_NAME"'
database_created=1

docker run --rm --network supabase_default \
  -v "$backup:/backup.dump:ro" -e PGPASSWORD -e RESTORE_DB_NAME="$database_name" \
  supabase/postgres:17.6.1.136 \
  sh -ec 'pg_restore -h db -U supabase_admin -d "$RESTORE_DB_NAME" --exit-on-error /backup.dump'

docker run --rm --network supabase_default --env-file "$runtime_env" \
  -e RESTORE_DB_NAME="$database_name" "$image" \
  node -e '
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${process.env.RESTORE_DB_NAME}`;
    process.stdout.write(`DATABASE_URL=${url.toString()}\n`);
  ' > "$database_env"
chmod 600 "$database_env"

query_scalar() {
  sql=$1
  docker run --rm --network supabase_default \
    -e PGPASSWORD -e RESTORE_DB_NAME="$database_name" -e REHEARSAL_SQL="$sql" \
    supabase/postgres:17.6.1.136 \
    sh -ec 'psql -X -qAt -v ON_ERROR_STOP=1 -h db -U supabase_admin -d "$RESTORE_DB_NAME" -c "$REHEARSAL_SQL"'
}

before_card_states=$(query_scalar 'select count(*) from public.user_card_states')
before_learning_records=$(query_scalar 'select count(*) from public.learning_records')
before_documents=$(query_scalar 'select count(*) from public.user_documents')
before_changes=$(query_scalar 'select count(*) from public.sync_changes')
before_auth_users=$(query_scalar 'select count(*) from auth.users')
before_migrations=$(query_scalar 'select count(*) from drizzle.__drizzle_migrations')
before_business_rows=$((before_card_states + before_learning_records + before_documents + before_changes))
test "$before_business_rows" -gt 0
test "$before_auth_users" -gt 0
test "$before_migrations" -gt 0

pre_plan=$work_dir/pre-plan.json
docker run --rm --network supabase_default --env-file "$database_env" "$image" \
  node services/api/scripts/migration-plan.mjs --json > "$pre_plan"
pre_summary=$(docker run --rm -v "$pre_plan:/evidence.json:ro" "$image" node -e '
  const p = require("/evidence.json");
  if (!p.safe || p.driftCount !== 0 || p.pendingCount < 1) process.exit(1);
  process.stdout.write(`${p.appliedCount}:${p.pendingCount}:${p.driftCount}`);
')

docker run --rm --network supabase_default --env-file "$database_env" "$image" \
  node services/api/scripts/migrate.mjs
docker run --rm --network supabase_default --env-file "$database_env" "$image" \
  node services/api/scripts/migration-plan.mjs --require-current

post_plan=$work_dir/post-plan.json
docker run --rm --network supabase_default --env-file "$database_env" "$image" \
  node services/api/scripts/migration-plan.mjs --json --require-current > "$post_plan"
post_summary=$(docker run --rm -v "$post_plan:/evidence.json:ro" "$image" node -e '
  const p = require("/evidence.json");
  if (!p.current || !p.safe || p.pendingCount !== 0 || p.driftCount !== 0) process.exit(1);
  process.stdout.write(`${p.appliedCount}:${p.pendingCount}:${p.driftCount}`);
')

after_card_states=$(query_scalar 'select count(*) from public.user_card_states')
after_learning_records=$(query_scalar 'select count(*) from public.learning_records')
after_documents=$(query_scalar 'select count(*) from public.user_documents')
after_changes=$(query_scalar 'select count(*) from public.sync_changes')
after_auth_users=$(query_scalar 'select count(*) from auth.users')
after_migrations=$(query_scalar 'select count(*) from drizzle.__drizzle_migrations')
test "$after_card_states" = "$before_card_states"
test "$after_learning_records" = "$before_learning_records"
test "$after_documents" = "$before_documents"
test "$after_changes" = "$before_changes"
test "$after_auth_users" = "$before_auth_users"
test "$after_migrations" -gt "$before_migrations"

missing_contracts=$(query_scalar "
  select count(*) from (values
    (to_regclass('public.commerce_products')),
    (to_regclass('public.phone_otp_intents')),
    (to_regclass('public.apple_notification_events')),
    (to_regclass('public.ai_consent_authorities')),
    (to_regclass('public.content_access_credentials')),
    (to_regclass('public.ops_staff_accounts'))
  ) as required(regclass) where regclass is null
")
unvalidated_constraints=$(query_scalar "
  select count(*) from pg_constraint c
  join pg_namespace n on n.oid = c.connamespace
  where n.nspname in ('public', 'auth') and not c.convalidated
")
device_digest_columns=$(query_scalar "
  select count(*) from information_schema.columns
  where table_schema = 'public' and table_name = 'content_access_credentials'
    and column_name = 'device_digest'
")
test "$missing_contracts" = 0
test "$unvalidated_constraints" = 0
test "$device_digest_columns" = 0

unset POSTGRES_PASSWORD
evidence=$evidence_dir/rehearsal-$source_id-$(date -u +%Y%m%dT%H%M%SZ).txt
{
  printf 'source_sha=%s\n' "$source_sha"
  printf 'archive_sha256=%s\n' "$archive_sha"
  printf 'backup_name=%s\n' "$backup_name"
  printf 'backup_sha256=%s\n' "$backup_sha"
  printf 'pre_plan=%s\n' "$pre_summary"
  printf 'post_plan=%s\n' "$post_summary"
  printf 'business_rows_preserved=%s\n' "$before_business_rows"
  printf 'auth_users_preserved=%s\n' "$before_auth_users"
  printf 'migration_rows_before=%s\n' "$before_migrations"
  printf 'migration_rows_after=%s\n' "$after_migrations"
  printf 'missing_contracts=%s\n' "$missing_contracts"
  printf 'unvalidated_constraints=%s\n' "$unvalidated_constraints"
  printf 'device_digest_columns=%s\n' "$device_digest_columns"
  printf 'completed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$evidence"
chmod 600 "$evidence"

printf 'production_migration_rehearsal_ok source=%s backup=%s pre=%s post=%s evidence=%s\n' \
  "$source_sha" "$backup_name" "$pre_summary" "$post_summary" "$evidence"
REMOTE

trap - EXIT HUP INT TERM
cleanup_local
