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

PRINT_CONFIRMATION=0
case "${1:-}" in
  --print-confirmation)
    if [ "$#" -ne 1 ]; then echo 'usage: apply-production-migrations.sh --print-confirmation' >&2; exit 2; fi
    PRINT_CONFIRMATION=1
    ;;
  '') ;;
  *) echo 'usage: apply-production-migrations.sh [--print-confirmation]' >&2; exit 2 ;;
esac

if [ "$PRINT_CONFIRMATION" = 1 ]; then
  node "$SOURCE_ROOT/tools/check-mainline-release.mjs" --root "$SOURCE_ROOT" >/dev/null
else
  node "$SOURCE_ROOT/tools/check-mainline-release.mjs" --root "$SOURCE_ROOT"
fi

SOURCE_SHA=$(git -C "$SOURCE_ROOT" rev-parse HEAD)
SOURCE_ID=$(printf '%.12s' "$SOURCE_SHA")
EXPECTED_PRE_PLAN=${ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN:-15:18:0}
EXPECTED_POST_PLAN=${ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN:-33:0:0}
CONTRACT_TOOL=$SOURCE_ROOT/tools/production-migration-apply-contract.mjs

if [ "$PRINT_CONFIRMATION" = 1 ]; then
  node "$CONTRACT_TOOL" print-confirmation "$SOURCE_SHA" "$EXPECTED_PRE_PLAN" "$EXPECTED_POST_PLAN"
  exit 0
fi

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
# BEGIN production-migration-upload-name-validation
upload_name=$(basename "$upload")
case "$upload_name" in
  source-????????????-????????????????????????????????.tar.gz) ;;
  *) echo 'production migration upload name is invalid' >&2; exit 1 ;;
esac
upload_identity=${upload_name#source-}
upload_identity=${upload_identity%.tar.gz}
case "$upload_identity" in
  *[!a-f0-9-]*) echo 'production migration upload name has unsafe characters' >&2; exit 1 ;;
esac
# END production-migration-upload-name-validation
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
before_migrations=unavailable
after_migrations=unavailable

for command_name in awk basename cat chmod date dirname docker flock grep install mv rm sed sha256sum stat tar; do
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
exec 9<>/run/lock/icao-production-migration-apply.lock
flock -n 9 || { echo 'another production migration apply is already running' >&2; exit 1; }
exec 8<>/run/lock/icao-production-migration-rehearsal.lock
flock -n 8 || { echo 'a production migration rehearsal is still running' >&2; exit 1; }
exec 7<>/run/lock/icao-postgres-backup.lock
flock -n 7 || { echo 'a production PostgreSQL backup is still running' >&2; exit 1; }
exec 6<>/run/lock/icao-production-release-change.lock
flock -n 6 || { echo 'a production API or Ops release change is still running' >&2; exit 1; }

# BEGIN production-migration-image-cleanup
cleanup_migration_image() {
  if [ "$image_created" != 1 ]; then return 0; fi
  if ! listed_images=$(docker image ls --format '{{.Repository}}:{{.Tag}}' --filter "reference=$image"); then
    echo "could not list production migration image during cleanup: $image" >&2
    return 1
  fi
  case "$listed_images" in
    '') image_created=0; return 0 ;;
    "$image") ;;
    *) echo "production migration image lookup returned unexpected results: $image" >&2; return 1 ;;
  esac
  if ! docker image inspect "$image" >/dev/null; then
    echo "could not inspect production migration image during cleanup: $image" >&2
    return 1
  fi
  if ! docker image rm "$image" >/dev/null; then
    echo "could not remove production migration image during cleanup: $image" >&2
    return 1
  fi
  if ! remaining_images=$(docker image ls --format '{{.Repository}}:{{.Tag}}' --filter "reference=$image"); then
    echo "could not verify production migration image cleanup: $image" >&2
    return 1
  fi
  if [ -n "$remaining_images" ]; then
    echo "production migration image still exists after cleanup: $image" >&2
    return 1
  fi
  image_created=0
}
# END production-migration-image-cleanup

cleanup_remote_resources() (
  set +e
  cleanup_failed=0
  case "$work_dir" in
    "$root"/.work-*)
      if [ "$work_dir_created" = 1 ]; then
        if [ -L "$work_dir" ]; then
          echo "production migration work path became a symlink: $work_dir" >&2
          cleanup_failed=1
        elif [ -e "$work_dir" ] && ! rm -rf "$work_dir"; then
          echo "could not remove production migration work path: $work_dir" >&2
          cleanup_failed=1
        fi
      fi
      ;;
    *) echo 'production migration cleanup path escaped its protected root' >&2; cleanup_failed=1 ;;
  esac
  if ! rm -f "$upload"; then
    echo "could not remove production migration upload: $upload" >&2
    cleanup_failed=1
  fi
  if ! rm -f "$checksum"; then
    echo "could not remove production migration checksum: $checksum" >&2
    cleanup_failed=1
  fi
  if ! cleanup_migration_image; then cleanup_failed=1; fi
  for cleanup_path in "$work_dir" "$upload" "$checksum"; do
    if [ -e "$cleanup_path" ] || [ -L "$cleanup_path" ]; then
      echo "production migration path still exists after cleanup: $cleanup_path" >&2
      cleanup_failed=1
    fi
  done
  exit "$cleanup_failed"
)

# BEGIN production-migration-evidence-publication
publish_evidence() (
  evidence_status=$1
  case "$evidence_status" in
    succeeded|failed) ;;
    *) echo 'production migration evidence status is invalid' >&2; exit 1 ;;
  esac
  if ! completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ); then
    echo 'could not determine production migration evidence completion time' >&2
    exit 1
  fi
  if ! evidence_timestamp=$(date -u +%Y%m%dT%H%M%SZ); then
    echo 'could not determine production migration evidence filename time' >&2
    exit 1
  fi
  evidence=$evidence_dir/apply-$source_id-$evidence_timestamp-$token_id-$evidence_status.txt
  partial=$evidence.partial.$$
  confirmation_input=$partial.confirmation
  case "$evidence:$partial:$confirmation_input" in
    "$evidence_dir"/apply-*.txt:"$evidence_dir"/apply-*.txt.partial.*:"$evidence_dir"/apply-*.txt.partial.*.confirmation) ;;
    *) echo 'production migration evidence path escaped its protected root' >&2; exit 1 ;;
  esac
  if [ -e "$evidence" ] || [ -L "$evidence" ] \
    || [ -e "$partial" ] || [ -L "$partial" ] \
    || [ -e "$confirmation_input" ] || [ -L "$confirmation_input" ]; then
    echo 'production migration evidence destination already exists' >&2
    exit 1
  fi
  evidence_published=0
  cleanup_evidence_staging() {
    staging_cleanup_failed=0
    for staging_path in "$partial" "$confirmation_input"; do
      if [ -e "$staging_path" ] || [ -L "$staging_path" ]; then
        if ! rm -f "$staging_path"; then
          echo "could not remove production migration evidence staging artifact: $staging_path" >&2
          staging_cleanup_failed=1
        fi
      fi
    done
    return "$staging_cleanup_failed"
  }
  cleanup_evidence_on_exit() {
    evidence_exit_status=$?
    trap - EXIT
    if [ "$evidence_published" = 0 ] && ! cleanup_evidence_staging; then
      echo 'production migration evidence staging cleanup failed' >&2
      evidence_exit_status=1
    fi
    exit "$evidence_exit_status"
  }
  trap cleanup_evidence_on_exit EXIT
  trap 'exit 1' HUP INT TERM
  if ! (set -C; : > "$partial"); then
    echo 'could not exclusively create production migration evidence staging file' >&2
    exit 1
  fi
  if ! (set -C; : > "$confirmation_input"); then
    echo 'could not exclusively create production migration confirmation hash input' >&2
    exit 1
  fi
  if ! chmod 600 "$partial" "$confirmation_input"; then
    echo 'could not protect production migration evidence staging files' >&2
    exit 1
  fi
  if ! printf '%s' "$confirmation" > "$confirmation_input"; then
    echo 'could not stage production migration confirmation for hashing' >&2
    exit 1
  fi
  if ! confirmation_sha_line=$(sha256sum "$confirmation_input"); then
    echo 'could not hash production migration confirmation' >&2
    exit 1
  fi
  confirmation_sha=${confirmation_sha_line%% *}
  case "$confirmation_sha" in
    ''|*[!a-f0-9]*) echo 'production migration confirmation hash is invalid' >&2; exit 1 ;;
  esac
  if [ "${#confirmation_sha}" -ne 64 ]; then
    echo 'production migration confirmation hash length is invalid' >&2
    exit 1
  fi
  if ! printf '%s\n' \
    "status=$evidence_status" \
    "stage=$stage" \
    "source_sha=$source_sha" \
    "archive_sha256=$archive_sha" \
    "confirmation_sha256=$confirmation_sha" \
    "backup_name=$backup_name" \
    "backup_sha256=$backup_sha" \
    "rehearsal_evidence=$rehearsal_evidence" \
    "expected_pre_plan=$expected_pre_plan" \
    "expected_post_plan=$expected_post_plan" \
    "observed_pre_plan=$pre_summary" \
    "observed_post_plan=$post_summary" \
    "migration_started=$migration_started" \
    "migration_completed=$migration_completed" \
    "migration_rows_before=$before_migrations" \
    "migration_rows_after=$after_migrations" \
    "business_rows_before=$before_business_rows" \
    "business_rows_after=$after_business_rows" \
    'business_row_count_observation=non_authoritative_concurrent_activity_allowed' \
    "auth_users_before=$before_auth_users" \
    "auth_users_after=$after_auth_users" \
    'auth_user_count_observation=non_authoritative_concurrent_activity_allowed' \
    'data_preservation_authority=isolated_rehearsal_preexisting_table_fingerprint' \
    "schema_contract_sha256=$schema_contract_sha" \
    "cleanup_verified=$cleanup_verified" \
    'automatic_production_restore=forbidden' \
    "recovery_validation_command=/bin/sh /opt/icao/runtime/backup-tools/current/restore-isolated.sh $backup" \
    'production_recovery=manual_authorization_required_choose_forward_fix_or_verified_restore' \
    'publication_state=complete' \
    "completed_at=$completed_at" > "$partial"; then
    echo 'could not write complete production migration evidence' >&2
    exit 1
  fi
  if ! require_root_owned_path file "$partial" 600; then
    echo 'production migration evidence staging file failed its final path guard' >&2
    exit 1
  fi
  if ! rm -f "$confirmation_input"; then
    echo 'could not remove production migration confirmation hash input' >&2
    exit 1
  fi
  if [ -e "$confirmation_input" ] || [ -L "$confirmation_input" ]; then
    echo 'production migration confirmation staging file survived required cleanup' >&2
    exit 1
  fi
  if [ -e "$evidence" ] || [ -L "$evidence" ]; then
    echo 'production migration evidence destination appeared before publication' >&2
    exit 1
  fi
  # The protected evidence directory and staging file have both passed their
  # final guards. A same-directory rename is the only publication step, so a
  # succeeded filename is never visible while cleanup or validation remains.
  if ! mv -- "$partial" "$evidence"; then
    echo 'could not atomically publish production migration evidence' >&2
    exit 1
  fi
  evidence_published=1
  if ! printf '%s\n' "$evidence"; then
    echo 'could not report published production migration evidence' >&2
    exit 1
  fi
  trap - EXIT HUP INT TERM
)
# END production-migration-evidence-publication

cleanup_on_exit() {
  original_status=$?
  trap - EXIT
  set +e
  final_status=$original_status
  if [ "$final_status" -eq 0 ]; then final_status=1; fi
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
  exit "$final_status"
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
  -e ICAO_PRODUCTION_MIGRATION_APPLY="apply:$source_sha:$expected_pre_plan:$expected_post_plan" \
  -e ICAO_PRODUCTION_MIGRATION_CONFIRM="$confirmation" \
  -e ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN="$expected_pre_plan" \
  -e ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN="$expected_post_plan" \
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
  if (p.status !== "verified" || p.readOnly !== true || p.requiredTables !== 56
      || p.expectedPublicTables !== 56 || p.actualPublicTables !== 56
      || p.unclassifiedPublicTables !== 0 || p.missingPublicTables !== 0
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
test "$after_migrations" -eq "${expected_post_plan%%:*}"

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
