#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"

SOURCE_ROOT=${ICAO_PRODUCTION_MIGRATION_SOURCE_ROOT:-$PROJECT_ROOT}
SOURCE_ROOT=$(CDPATH= cd -- "$SOURCE_ROOT" && pwd)
SOURCE_GIT_ROOT=$(git -C "$SOURCE_ROOT" rev-parse --show-toplevel 2>/dev/null || true)
if [ "$SOURCE_GIT_ROOT" != "$SOURCE_ROOT" ]; then
  echo 'ICAO_PRODUCTION_MIGRATION_SOURCE_ROOT must be the root of a Git worktree.' >&2
  exit 1
fi
node "$SOURCE_ROOT/tools/check-mainline-release.mjs" --root "$SOURCE_ROOT"

SOURCE_SHA=$(git -C "$SOURCE_ROOT" rev-parse HEAD)
SOURCE_ID=$(printf '%.12s' "$SOURCE_SHA")
EXPECTED_PRE_PLAN=${ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN:-15:18:0}
EXPECTED_POST_PLAN=${ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN:-33:0:0}
CONTRACT_TOOL=$SOURCE_ROOT/tools/production-migration-apply-contract.mjs

case "${1:-}" in
  --print-confirmation)
    if [ "$#" -ne 1 ]; then echo 'usage: apply-production-migrations.sh --print-confirmation' >&2; exit 2; fi
    node "$CONTRACT_TOOL" print-confirmation "$SOURCE_SHA" "$EXPECTED_PRE_PLAN" "$EXPECTED_POST_PLAN"
    exit 0
    ;;
  '') ;;
  *) echo 'usage: apply-production-migrations.sh [--print-confirmation]' >&2; exit 2 ;;
esac

CONFIRMATION=${ICAO_PRODUCTION_MIGRATION_CONFIRM:-}
node "$CONTRACT_TOOL" confirm \
  "$SOURCE_SHA" "$EXPECTED_PRE_PLAN" "$EXPECTED_POST_PLAN" "$CONFIRMATION" >/dev/null

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
case "$BUILD_NPM_REGISTRY" in
  *[!A-Za-z0-9._~:/%-]*)
    echo 'ICAO_API_BUILD_NPM_REGISTRY contains characters unsafe for remote argument transport.' >&2
    exit 1
    ;;
esac
if [ ! -r "$SSH_KEY" ]; then
  echo "Project SSH key is not readable: $SSH_KEY" >&2
  exit 1
fi

UPLOAD_TOKEN=$(openssl rand -hex 16)
case "$SOURCE_SHA:$UPLOAD_TOKEN" in
  *[!A-Fa-f0-9:]*) echo 'Production migration source or upload identity is invalid.' >&2; exit 1 ;;
esac

LOCAL_DIR=$(mktemp -d "${TMPDIR:-/tmp}/icao-production-migration.XXXXXX")
case "$LOCAL_DIR" in
  "${TMPDIR:-/tmp}"/icao-production-migration.*) ;;
  *) echo 'Production migration local work path escaped its protected prefix.' >&2; exit 1 ;;
esac
chmod 700 "$LOCAL_DIR"
ARCHIVE=$LOCAL_DIR/source.tar.gz
REHEARSAL_LOG=$LOCAL_DIR/rehearsal.log
REMOTE_ROOT=/opt/icao/runtime/production-migrations
REMOTE_UPLOAD=$REMOTE_ROOT/uploads/source-$SOURCE_ID-$UPLOAD_TOKEN.tar.gz
REMOTE_CHECKSUM=$REMOTE_UPLOAD.sha256
REMOTE_CLEANUP_ARMED=0

cleanup_local_resources() (
  set +e
  cleanup_failed=0
  case "$LOCAL_DIR" in
    "${TMPDIR:-/tmp}"/icao-production-migration.*) rm -rf "$LOCAL_DIR" || cleanup_failed=1 ;;
    *) cleanup_failed=1 ;;
  esac
  if [ "$REMOTE_CLEANUP_ARMED" = 1 ]; then
    ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" \
      "rm -f '$REMOTE_UPLOAD' '$REMOTE_CHECKSUM'" >/dev/null 2>&1 || cleanup_failed=1
  fi
  exit "$cleanup_failed"
)
cleanup_local_on_exit() {
  original_status=$?
  trap - EXIT
  if ! cleanup_local_resources; then original_status=1; fi
  exit "$original_status"
}
trap cleanup_local_on_exit EXIT
trap 'exit 1' HUP INT TERM

# This creates a fresh production backup, verifies its checksum, restores it to
# an isolated database, applies the exact candidate suffix there, proves data
# preservation, and removes every temporary rehearsal resource before success.
ICAO_MIGRATION_REHEARSAL_SOURCE_ROOT=$SOURCE_ROOT \
  /bin/sh "$SOURCE_ROOT/scripts/rehearse-production-migrations.sh" > "$REHEARSAL_LOG"
REHEARSAL_CONTRACT=$(node "$CONTRACT_TOOL" parse-rehearsal \
  "$SOURCE_SHA" "$EXPECTED_PRE_PLAN" "$EXPECTED_POST_PLAN" "$REHEARSAL_LOG")
BACKUP_NAME=${REHEARSAL_CONTRACT%%|*}
REHEARSAL_EVIDENCE=${REHEARSAL_CONTRACT#*|}
if [ "$BACKUP_NAME|$REHEARSAL_EVIDENCE" != "$REHEARSAL_CONTRACT" ]; then
  echo 'The migration rehearsal contract is malformed.' >&2
  exit 1
fi

(
  cd "$SOURCE_ROOT"
  git archive --format=tar "$SOURCE_SHA" \
    package.json pnpm-lock.yaml pnpm-workspace.yaml patches \
    modules/icao-distribution-environment packages/contracts services/api \
    content/vocabulary infra/api \
    | gzip -n > "$ARCHIVE"
)
node "$SOURCE_ROOT/tools/check-mainline-release.mjs" --root "$SOURCE_ROOT"
test "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" = "$SOURCE_SHA"
ARCHIVE_SHA=$(shasum -a 256 "$ARCHIVE" | awk '{ print $1 }')
printf '%s  %s\n' "$ARCHIVE_SHA" "$(basename "$REMOTE_UPLOAD")" > "$ARCHIVE.sha256"
chmod 600 "$ARCHIVE" "$ARCHIVE.sha256" "$REHEARSAL_LOG"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- \
  "$REMOTE_UPLOAD" "$REMOTE_CHECKSUM" <<'REMOTE_PREPARE'
set -eu
umask 077
upload=$1
checksum=$2
root=/opt/icao/runtime/production-migrations
case "$upload:$checksum" in
  "$root"/uploads/source-*.tar.gz:"$root"/uploads/source-*.tar.gz.sha256) ;;
  *) echo 'production migration upload path escaped its protected root' >&2; exit 1 ;;
esac
for directory in "$root" "$root/uploads" "$root/evidence"; do
  if [ -e "$directory" ] || [ -L "$directory" ]; then
    test -d "$directory"
    test ! -L "$directory"
    test "$(stat -c '%u:%a' -- "$directory")" = '0:700'
  else
    install -d -m 700 "$directory"
  fi
done
case "$(basename "$upload")" in
  source-[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9]*.tar.gz) ;;
  *) echo 'production migration upload name is invalid' >&2; exit 1 ;;
esac
case "$(basename "$upload")" in *[!a-f0-9.-]*) echo 'production migration upload name has unsafe characters' >&2; exit 1 ;; esac
test ! -e "$upload" && test ! -L "$upload"
test ! -e "$checksum" && test ! -L "$checksum"
created_upload=0
created_checksum=0
cleanup_prepare() {
  original_status=$?
  trap - EXIT
  if [ "$created_checksum" = 1 ]; then rm -f "$checksum"; fi
  if [ "$created_upload" = 1 ]; then rm -f "$upload"; fi
  exit "$original_status"
}
trap cleanup_prepare EXIT
trap 'exit 1' HUP INT TERM
set -C
: > "$upload"
created_upload=1
: > "$checksum"
created_checksum=1
set +C
chmod 600 "$upload" "$checksum"
trap - EXIT HUP INT TERM
REMOTE_PREPARE
REMOTE_CLEANUP_ARMED=1
scp -i "$SSH_KEY" -q "$ARCHIVE" "$ECS_USER@$ECS_HOST:$REMOTE_UPLOAD"
scp -i "$SSH_KEY" -q "$ARCHIVE.sha256" "$ECS_USER@$ECS_HOST:$REMOTE_CHECKSUM"
ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" \
  "chmod 600 '$REMOTE_UPLOAD' '$REMOTE_CHECKSUM'"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- \
  "$SOURCE_SHA" "$ARCHIVE_SHA" "$UPLOAD_TOKEN" "$BUILD_NPM_REGISTRY" \
  "$EXPECTED_PRE_PLAN" "$EXPECTED_POST_PLAN" "$BACKUP_NAME" "$REHEARSAL_EVIDENCE" \
  "$CONFIRMATION" <<'REMOTE'
set -eu
umask 077

source_sha=$1
archive_sha=$2
upload_token=$3
build_npm_registry=$4
expected_pre_plan=$5
expected_post_plan=$6
backup_name=$7
rehearsal_evidence=$8
confirmation=$9
source_id=$(printf '%.12s' "$source_sha")
token_id=$(printf '%.12s' "$upload_token")
root=/opt/icao/runtime/production-migrations
upload=$root/uploads/source-$source_id-$upload_token.tar.gz
checksum=$upload.sha256
work_dir=$root/.work-$source_id-$upload_token
evidence_dir=$root/evidence
runtime_env=/opt/icao/runtime/api/.env
backup_root=/opt/icao/backups/postgres
backup=$backup_root/$backup_name
image=icao-api:production-migration-$source_id-$token_id
stage=remote_preflight
migration_started=0
migration_completed=0
cleanup_verified=0
image_created=0
work_dir_created=0
pre_summary=unavailable
post_summary=unavailable
backup_sha=unavailable
schema_contract_sha=unavailable
before_business_rows=unavailable
before_auth_users=unavailable
after_business_rows=unavailable
after_auth_users=unavailable
business_rows_preserved=0
auth_users_preserved=0
before_migrations=unavailable
after_migrations=unavailable

for command_name in awk basename cat chmod date dirname docker flock grep install ln rm sed sha256sum stat tar; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "required remote production migration command is missing: $command_name" >&2
    exit 1
  }
done

case "$source_sha:$archive_sha:$upload_token" in
  *[!A-Fa-f0-9:]*) echo 'remote production migration identity is invalid' >&2; exit 1 ;;
esac
case "$expected_pre_plan:$expected_post_plan" in
  *[!0-9:]*) echo 'remote expected migration plan is invalid' >&2; exit 1 ;;
esac
test "$confirmation" = "APPLY_PRODUCTION_MIGRATIONS:$source_sha:$expected_pre_plan:$expected_post_plan"
printf '%s\n' "$backup_name" \
  | grep -Eq '^icao-[0-9]{8}T[0-9]{6}Z-[0-9]+\.dump$' \
  || { echo 'remote production backup name is invalid' >&2; exit 1; }
printf '%s\n' "$rehearsal_evidence" \
  | grep -Eq '^/opt/icao/runtime/migration-rehearsals/evidence/rehearsal-[a-f0-9]{12}-[0-9]{8}T[0-9]{6}Z\.txt$' \
  || { echo 'remote rehearsal evidence path escaped its protected root' >&2; exit 1; }
case "$work_dir" in
  "$root"/.work-*) ;;
  *) echo 'production migration work path escaped its protected root' >&2; exit 1 ;;
esac

# BEGIN production-migration-path-guard
require_root_owned_path() {
  path_kind=$1
  protected_path=$2
  required_mode=$3
  if [ -L "$protected_path" ]; then
    echo "protected production migration path is a symlink: $protected_path" >&2
    return 1
  fi
  case "$path_kind" in
    file) test -f "$protected_path" ;;
    directory) test -d "$protected_path" ;;
    *) echo 'invalid protected path kind' >&2; return 1 ;;
  esac
  actual_identity=$(stat -c '%u:%a' -- "$protected_path")
  if [ "$actual_identity" != "0:$required_mode" ]; then
    echo "protected production migration path has unsafe owner or mode: $protected_path" >&2
    return 1
  fi
}
# END production-migration-path-guard

# BEGIN production-migration-lock-guard
prepare_lock_file() {
  lock_path=$1
  if [ -L "$lock_path" ]; then
    echo "protected production lock path is a symlink: $lock_path" >&2
    return 1
  fi
  if [ ! -e "$lock_path" ]; then
    set -C
    : > "$lock_path"
    set +C
  fi
  test -f "$lock_path"
  test ! -L "$lock_path"
  test "$(stat -c %u -- "$lock_path")" = 0
  chmod 600 "$lock_path"
  require_root_owned_path file "$lock_path" 600
}
# END production-migration-lock-guard

for directory in "$root" "$root/uploads" "$evidence_dir" "$backup_root" \
  "$(dirname "$rehearsal_evidence")"; do
  require_root_owned_path directory "$directory" 700
done
for protected_file in "$upload" "$checksum" "$runtime_env" "$backup" "$backup.sha256" \
  "$rehearsal_evidence"; do
  require_root_owned_path file "$protected_file" 600
done

# Serialize production migration, rehearsals, scheduled backups, and API/Ops
# release cutovers. The backup and rehearsal already completed before these
# locks are taken; a competing operation makes this invocation fail closed.
for lock_path in \
  /run/lock/icao-production-migration-apply.lock \
  /run/lock/icao-production-migration-rehearsal.lock \
  /run/lock/icao-postgres-backup.lock \
  /run/lock/icao-production-release-change.lock
do
  prepare_lock_file "$lock_path"
done
exec 9>/run/lock/icao-production-migration-apply.lock
flock -n 9 || { echo 'another production migration apply is already running' >&2; exit 1; }
exec 8>/run/lock/icao-production-migration-rehearsal.lock
flock -n 8 || { echo 'a production migration rehearsal is still running' >&2; exit 1; }
exec 7>/run/lock/icao-postgres-backup.lock
flock -n 7 || { echo 'a production PostgreSQL backup is still running' >&2; exit 1; }
exec 6>/run/lock/icao-production-release-change.lock
flock -n 6 || { echo 'a production API or Ops release change is still running' >&2; exit 1; }

cleanup_migration_image() {
  if [ "$image_created" != 1 ]; then return 0; fi
  if ! listed_images=$(docker image ls --format '{{.Repository}}:{{.Tag}}' --filter "reference=$image"); then
    echo "could not list production migration image during cleanup: $image" >&2
    return 1
  fi
  case "$listed_images" in
    '') return 0 ;;
    "$image") ;;
    *) echo "production migration image lookup returned unexpected results: $image" >&2; return 1 ;;
  esac
  docker image inspect "$image" >/dev/null
  docker image rm "$image" >/dev/null
  remaining_images=$(docker image ls --format '{{.Repository}}:{{.Tag}}' --filter "reference=$image")
  test -z "$remaining_images"
}

cleanup_remote_resources() (
  set +e
  cleanup_failed=0
  case "$work_dir" in
    "$root"/.work-*)
      if [ "$work_dir_created" = 1 ]; then
        if [ -L "$work_dir" ]; then cleanup_failed=1
        elif [ -e "$work_dir" ]; then rm -rf "$work_dir" || cleanup_failed=1
        fi
      fi
      ;;
    *) cleanup_failed=1 ;;
  esac
  rm -f "$upload" "$checksum" || cleanup_failed=1
  if ! cleanup_migration_image; then cleanup_failed=1; fi
  for cleanup_path in "$work_dir" "$upload" "$checksum"; do
    if [ -e "$cleanup_path" ] || [ -L "$cleanup_path" ]; then cleanup_failed=1; fi
  done
  exit "$cleanup_failed"
)

publish_evidence() (
  evidence_status=$1
  case "$evidence_status" in succeeded|failed) ;; *) exit 1 ;; esac
  completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  evidence=$evidence_dir/apply-$source_id-$(date -u +%Y%m%dT%H%M%SZ)-$token_id-$evidence_status.txt
  partial=$evidence.partial.$$
  case "$evidence:$partial" in
    "$evidence_dir"/apply-*.txt:"$evidence_dir"/apply-*.txt.partial.*) ;;
    *) echo 'production migration evidence path escaped its protected root' >&2; exit 1 ;;
  esac
  test ! -e "$evidence" && test ! -L "$evidence"
  test ! -e "$partial" && test ! -L "$partial"
  cleanup_evidence_partial() { rm -f "$partial"; }
  trap cleanup_evidence_partial EXIT
  trap 'exit 1' HUP INT TERM
  set -C
  : > "$partial"
  set +C
  {
    printf 'status=%s\n' "$evidence_status"
    printf 'stage=%s\n' "$stage"
    printf 'source_sha=%s\n' "$source_sha"
    printf 'archive_sha256=%s\n' "$archive_sha"
    printf 'confirmation_sha256=%s\n' "$(printf '%s' "$confirmation" | sha256sum | awk '{ print $1 }')"
    printf 'backup_name=%s\n' "$backup_name"
    printf 'backup_sha256=%s\n' "$backup_sha"
    printf 'rehearsal_evidence=%s\n' "$rehearsal_evidence"
    printf 'expected_pre_plan=%s\n' "$expected_pre_plan"
    printf 'expected_post_plan=%s\n' "$expected_post_plan"
    printf 'observed_pre_plan=%s\n' "$pre_summary"
    printf 'observed_post_plan=%s\n' "$post_summary"
    printf 'migration_started=%s\n' "$migration_started"
    printf 'migration_completed=%s\n' "$migration_completed"
    printf 'migration_rows_before=%s\n' "$before_migrations"
    printf 'migration_rows_after=%s\n' "$after_migrations"
    printf 'business_rows_before=%s\n' "$before_business_rows"
    printf 'business_rows_after=%s\n' "$after_business_rows"
    printf 'business_rows_preserved=%s\n' "$business_rows_preserved"
    printf 'auth_users_before=%s\n' "$before_auth_users"
    printf 'auth_users_after=%s\n' "$after_auth_users"
    printf 'auth_users_preserved=%s\n' "$auth_users_preserved"
    printf 'schema_contract_sha256=%s\n' "$schema_contract_sha"
    printf 'cleanup_verified=%s\n' "$cleanup_verified"
    printf 'automatic_production_restore=forbidden\n'
    printf 'recovery_validation_command=/bin/sh /opt/icao/runtime/backup-tools/current/restore-isolated.sh %s\n' "$backup"
    printf 'production_recovery=manual_authorization_required_choose_forward_fix_or_verified_restore\n'
    printf 'completed_at=%s\n' "$completed_at"
  } > "$partial"
  chmod 600 "$partial"
  ln "$partial" "$evidence"
  rm "$partial"
  trap - EXIT HUP INT TERM
  require_root_owned_path file "$evidence" 600
  printf '%s\n' "$evidence"
)

cleanup_on_exit() {
  original_status=$?
  trap - EXIT
  set +e
  cleanup_failed=0
  if ! cleanup_remote_resources; then
    stage=cleanup_failed
    cleanup_failed=1
  fi
  if [ "$cleanup_failed" = 0 ]; then cleanup_verified=1; fi
  if ! failure_evidence=$(publish_evidence failed); then
    echo 'production migration failed and failure evidence could not be published' >&2
  else
    echo "production migration failed closed; evidence=$failure_evidence" >&2
  fi
  # Never restore or overwrite the live database automatically. If migration
  # started, the evidence and fresh backup identify the separately authorized
  # forward-fix or verified-restore recovery path.
  exit "${original_status:-1}"
}
trap cleanup_on_exit EXIT
trap 'exit 1' HUP INT TERM

stage=archive_verification
expected_checksum_line="$archive_sha  $(basename "$upload")"
actual_checksum_line=$(cat "$checksum")
test "$actual_checksum_line" = "$expected_checksum_line"
(
  cd "$(dirname "$upload")"
  sha256sum -c "$(basename "$checksum")"
)

evidence_value() {
  evidence_key=$1
  evidence_count=$(grep -c "^$evidence_key=" "$rehearsal_evidence" || true)
  test "$evidence_count" = 1
  sed -n "s/^$evidence_key=//p" "$rehearsal_evidence"
}

stage=rehearsal_evidence_verification
test "$(evidence_value source_sha)" = "$source_sha"
test "$(evidence_value backup_name)" = "$backup_name"
test "$(evidence_value pre_plan)" = "$expected_pre_plan"
test "$(evidence_value post_plan)" = "$expected_post_plan"
test "$(evidence_value cleanup_verified)" = 1
test "$(evidence_value isolated_database_removed)" = 1
test "$(evidence_value missing_preexisting_tables)" = 0
test "$(evidence_value preexisting_fingerprint_mismatches)" = 0
test "$(evidence_value missing_contracts)" = 0
test "$(evidence_value unvalidated_constraints)" = 0
test "$(evidence_value device_digest_columns)" = 0
backup_sha=$(evidence_value backup_sha256)
case "$backup_sha" in ''|*[!A-Fa-f0-9]*) echo 'rehearsal backup SHA is invalid' >&2; exit 1 ;; esac
test "$(evidence_value archive_sha256)" = "$archive_sha"
rehearsal_completed_at=$(evidence_value completed_at)
printf '%s\n' "$rehearsal_completed_at" \
  | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
rehearsal_completed_epoch=$(date -d "$rehearsal_completed_at" +%s)
now_epoch=$(date +%s)
rehearsal_age=$((now_epoch - rehearsal_completed_epoch))
test "$rehearsal_age" -ge 0
test "$rehearsal_age" -le 1800

stage=backup_verification
actual_backup_checksum_line=$(cat "$backup.sha256")
test "$actual_backup_checksum_line" = "$backup_sha  $backup_name"
(
  cd "$backup_root"
  sha256sum -c "$backup_name.sha256"
)
backup_mtime=$(stat -c %Y "$backup")
backup_age=$((now_epoch - backup_mtime))
test "$backup_age" -ge 0
test "$backup_age" -le 1800

stage=source_extraction
test ! -e "$work_dir"
install -d -m 700 "$work_dir"
work_dir_created=1
tar -xzf "$upload" -C "$work_dir"
if docker image inspect "$image" >/dev/null 2>&1; then
  echo "unique production migration image already exists: $image" >&2
  exit 1
fi
docker build \
  --build-arg "ICAO_API_RELEASE_ID=production-migration-$source_id" \
  --build-arg "ICAO_NPM_REGISTRY=$build_npm_registry" \
  -t "$image" -f "$work_dir/infra/api/Dockerfile" "$work_dir"
image_created=1

stage=production_target_verification
docker inspect -f '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' supabase-db \
  | grep -Fx 'true healthy' >/dev/null
docker run --rm --network supabase_default --env-file "$runtime_env" \
  -e ICAO_PRODUCTION_DATABASE_NAME=postgres "$image" node -e '
    const url = new URL(process.env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) process.exit(1);
    if (url.hostname !== "db" || url.pathname !== "/postgres" || url.search || url.hash) process.exit(1);
    process.stdout.write("production_database_target_verified\n");
  '

query_scalar() {
  production_sql=$1
  POSTGRES_PASSWORD=$(docker exec supabase-db printenv POSTGRES_PASSWORD)
  test -n "$POSTGRES_PASSWORD"
  PGPASSWORD=$POSTGRES_PASSWORD docker run --rm --network supabase_default \
    -e PGPASSWORD -e PRODUCTION_SQL="$production_sql" \
    supabase/postgres:17.6.1.136 \
    sh -ec 'psql -X -qAt -v ON_ERROR_STOP=1 -h db -U supabase_admin -d postgres -c "$PRODUCTION_SQL"'
  unset POSTGRES_PASSWORD
}

stage=pre_plan_verification
pre_plan=$work_dir/pre-plan.json
docker run --rm --network supabase_default --env-file "$runtime_env" "$image" \
  node services/api/scripts/migration-plan.mjs --json > "$pre_plan"
pre_summary=$(docker run --rm -v "$pre_plan:/evidence.json:ro" "$image" node -e '
  const p = require("/evidence.json");
  if (!p.safe || p.driftCount !== 0 || p.pendingCount < 1) process.exit(1);
  process.stdout.write(`${p.appliedCount}:${p.pendingCount}:${p.driftCount}`);
')
test "$pre_summary" = "$expected_pre_plan"

before_card_states=$(query_scalar 'select count(*) from public.user_card_states')
before_learning_records=$(query_scalar 'select count(*) from public.learning_records')
before_documents=$(query_scalar 'select count(*) from public.user_documents')
before_changes=$(query_scalar 'select count(*) from public.sync_changes')
before_auth_users=$(query_scalar 'select count(*) from auth.users')
before_migrations=$(query_scalar 'select count(*) from drizzle.__drizzle_migrations')
before_business_rows=$((before_card_states + before_learning_records + before_documents + before_changes))
test "$before_business_rows" -gt 0
test "$before_auth_users" -gt 0
test "$before_migrations" -eq "${expected_pre_plan%%:*}"

stage=production_migration_apply
migration_started=1
docker run --rm --network supabase_default --env-file "$runtime_env" \
  -e ICAO_PRODUCTION_MIGRATION_APPLY="apply:$source_sha" \
  -e ICAO_PRODUCTION_MIGRATION_SOURCE_SHA="$source_sha" \
  "$image" node services/api/scripts/migrate.mjs --production-apply
migration_completed=1

stage=post_plan_verification
docker run --rm --network supabase_default --env-file "$runtime_env" "$image" \
  node services/api/scripts/migration-plan.mjs --require-current
post_plan=$work_dir/post-plan.json
docker run --rm --network supabase_default --env-file "$runtime_env" "$image" \
  node services/api/scripts/migration-plan.mjs --json --require-current > "$post_plan"
post_summary=$(docker run --rm -v "$post_plan:/evidence.json:ro" "$image" node -e '
  const p = require("/evidence.json");
  if (!p.current || !p.safe || p.pendingCount !== 0 || p.driftCount !== 0) process.exit(1);
  process.stdout.write(`${p.appliedCount}:${p.pendingCount}:${p.driftCount}`);
')
test "$post_summary" = "$expected_post_plan"

stage=post_schema_verification
schema_contract=$work_dir/schema-contract.json
docker run --rm --network supabase_default --env-file "$runtime_env" \
  -e ICAO_PRODUCTION_DATABASE_NAME=postgres "$image" \
  node services/api/scripts/verify-production-schema-contract.mjs > "$schema_contract"
docker run --rm -v "$schema_contract:/evidence.json:ro" "$image" node -e '
  const p = require("/evidence.json");
  if (p.status !== "verified" || p.readOnly !== true || p.requiredTables < 18
      || p.commerceProducts !== 5 || p.appleProductMappings !== 5
      || p.unvalidatedConstraints !== 0 || p.serverOnlyClientGrants !== 0
      || p.deviceDigestColumns !== 0) process.exit(1);
'
schema_contract_sha=$(sha256sum "$schema_contract" | awk '{ print $1 }')

after_card_states=$(query_scalar 'select count(*) from public.user_card_states')
after_learning_records=$(query_scalar 'select count(*) from public.learning_records')
after_documents=$(query_scalar 'select count(*) from public.user_documents')
after_changes=$(query_scalar 'select count(*) from public.sync_changes')
after_auth_users=$(query_scalar 'select count(*) from auth.users')
after_migrations=$(query_scalar 'select count(*) from drizzle.__drizzle_migrations')
after_business_rows=$((after_card_states + after_learning_records + after_documents + after_changes))
test "$after_card_states" = "$before_card_states"
test "$after_learning_records" = "$before_learning_records"
test "$after_documents" = "$before_documents"
test "$after_changes" = "$before_changes"
test "$after_auth_users" = "$before_auth_users"
test "$after_migrations" -eq "${expected_post_plan%%:*}"
business_rows_preserved=1
auth_users_preserved=1

stage=cleanup
cleanup_remote_resources
cleanup_verified=1
stage=completed
success_evidence=$(publish_evidence succeeded)
trap - EXIT HUP INT TERM
printf 'production_migration_apply_ok source=%s backup=%s pre=%s post=%s evidence=%s\n' \
  "$source_sha" "$backup_name" "$pre_summary" "$post_summary" "$success_evidence"
REMOTE

REMOTE_CLEANUP_ARMED=0
cleanup_local_resources
trap - EXIT HUP INT TERM
