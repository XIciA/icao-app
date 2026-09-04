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
CONTRACT_TOOL=$SOURCE_ROOT/tools/production-migration-apply-contract.mjs
EXPECTED_PRE_PLAN=${ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN:-}
if [ -z "$EXPECTED_PRE_PLAN" ]; then
  echo 'ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN is required and must come from the read-only production ledger plan.' >&2
  exit 1
fi
if [ -n "${ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN:-}" ]; then
  echo 'ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN is derived from the immutable migration journal and must not be overridden.' >&2
  exit 1
fi
EXPECTED_POST_PLAN=$(node "$CONTRACT_TOOL" derive-post "$EXPECTED_PRE_PLAN" \
  "$SOURCE_ROOT/services/api/drizzle/meta/_journal.json")

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
    modules/icao-distribution-environment modules/icao-wechat-auth \
    packages/contracts services/api \
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
# BEGIN production-migration-remote-prepare
set -eu
umask 077
upload=$1
checksum=$2
root=/opt/icao/runtime/production-migrations
# BEGIN production-migration-upload-name-validation
upload_identity=${upload#"$root"/uploads/source-}
if [ "$upload_identity" = "$upload" ]; then
  echo 'production migration upload path escaped its protected root' >&2
  exit 1
fi
case "$upload_identity" in
  *.tar.gz) upload_identity=${upload_identity%.tar.gz} ;;
  *) echo 'production migration upload name is invalid' >&2; exit 1 ;;
esac
source_id=${upload_identity%%-*}
upload_token=${upload_identity#*-}
case "$source_id" in
  ''|*[!0123456789abcdef]*) echo 'production migration source id is invalid' >&2; exit 1 ;;
esac
if [ "${#source_id}" -ne 12 ]; then
  echo 'production migration source id is invalid' >&2
  exit 1
fi
case "$upload_token" in
  ''|*[!0123456789abcdef]*) echo 'production migration upload token is invalid' >&2; exit 1 ;;
esac
if [ "${#upload_token}" -ne 32 ]; then
  echo 'production migration upload token is invalid' >&2
  exit 1
fi
expected_upload=$root/uploads/source-$source_id-$upload_token.tar.gz
expected_checksum=$expected_upload.sha256
if [ "$upload" != "$expected_upload" ] || [ "$checksum" != "$expected_checksum" ]; then
  echo 'production migration upload or checksum path escaped its protected root' >&2
  exit 1
fi
case "$upload:$checksum" in
  *'/../'*|*'/./'*|*'//'*)
    echo 'production migration upload or checksum path is not canonical' >&2
    exit 1
    ;;
esac
# END production-migration-upload-name-validation
for directory in "$root" "$root/uploads" "$root/evidence"; do
  if [ -e "$directory" ] || [ -L "$directory" ]; then
    test -d "$directory"
    test ! -L "$directory"
    test "$(stat -c '%u:%a' -- "$directory")" = '0:700'
  else
    install -d -m 700 "$directory"
  fi
done
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
# END production-migration-remote-prepare
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
trusted_python=/usr/bin/python3.10
backup_root=/opt/icao/backups/postgres
backup=$backup_root/$backup_name
image=icao-api:production-migration-$source_id-$token_id
expected_image_release_id=production-migration-$source_id
runtime_compose=/opt/icao/runtime/api/docker-compose.yml
runtime_source=/opt/icao/runtime/source
runtime_api_dir=$(dirname "$runtime_env")
runtime_env_next=$runtime_api_dir/.env.next-$source_id-$token_id
runtime_compose_next=$runtime_api_dir/docker-compose.yml.next-$source_id-$token_id
runtime_source_next=$runtime_source.next
candidate_runtime_root=/run/icao-production-migrations
candidate_runtime_env=$candidate_runtime_root/candidate-$source_id-$token_id.env
cutover_root=$root/cutovers
cutover_record_dir=$cutover_root/cutover-$source_id-$token_id
backup_tool=/opt/icao/runtime/backup-tools/current/backup-postgres.sh
stage=remote_preflight
migration_started=0
migration_completed=0
old_api_drain_started=0
old_api_drained=0
old_api_restart_verified=0
roll_forward_only=0
new_api_started=0
cutover_committed=0
cleanup_verified=0
cleanup_in_progress=0
image_created=0
work_dir_created=0
candidate_runtime_env_created=0
runtime_env_next_created=0
runtime_compose_next_created=0
runtime_source_next_created=0
failure_semantics=not_applicable
failure_origin_stage=unavailable
pre_summary=unavailable
post_summary=unavailable
backup_sha=unavailable
cutover_backup_name=unavailable
cutover_backup_sha=unavailable
drain_completed_at=unavailable
cutover_backup_completed_at=unavailable
old_running_image=unavailable
old_running_release_id=unavailable
old_api_exit_state=unavailable
schema_contract_sha=unavailable
rehearsal_schema_contract_sha=unavailable
before_business_rows=unavailable
before_auth_users=unavailable
after_business_rows=unavailable
after_auth_users=unavailable
before_migrations=unavailable
after_migrations=unavailable

for command_name in awk basename cat chmod cp curl date dirname docker flock grep install mv rm sed seq sha256sum sleep stat tar tr; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "required remote production migration command is missing: $command_name" >&2
    exit 1
  }
done

# BEGIN production-migration-trusted-python-guard
# BEGIN production-migration-trusted-python-runner
run_trusted_python() (
  unset \
    LD_AUDIT \
    GLIBC_TUNABLES \
    LD_ASSUME_KERNEL \
    LD_BIND_NOW \
    LD_BIND_NOT \
    LD_DEBUG \
    LD_DEBUG_OUTPUT \
    LD_DYNAMIC_WEAK \
    LD_HWCAP_MASK \
    LD_LIBRARY_PATH \
    LD_ORIGIN_PATH \
    LD_POINTER_GUARD \
    LD_PREFER_MAP_32BIT_EXEC \
    LD_PRELOAD \
    LD_PROFILE \
    LD_PROFILE_OUTPUT \
    LD_SHOW_AUXV \
    LD_TRACE_LOADED_OBJECTS \
    LD_USE_LOAD_BIAS \
    LD_VERBOSE \
    LD_WARN \
    PYTHONBREAKPOINT \
    PYTHONCOERCECLOCALE \
    PYTHONDONTWRITEBYTECODE \
    PYTHONHASHSEED \
    PYTHONHOME \
    PYTHONINSPECT \
    PYTHONIOENCODING \
    PYTHONNOUSERSITE \
    PYTHONPATH \
    PYTHONPLATLIBDIR \
    PYTHONSAFEPATH \
    PYTHONSTARTUP \
    PYTHONUSERBASE \
    PYTHONUTF8 \
    PYTHONWARNINGS
  exec "$trusted_python" "$@"
)
# END production-migration-trusted-python-runner
if [ ! -f "$trusted_python" ] || [ -L "$trusted_python" ] || [ ! -x "$trusted_python" ]; then
  echo "trusted production migration Python is missing, linked, or not executable: $trusted_python" >&2
  exit 1
fi
trusted_python_identity=$(stat -c '%u:%a' -- "$trusted_python")
case "$trusted_python_identity" in
  0:555|0:755) ;;
  *) echo "trusted production migration Python has unsafe owner or mode: $trusted_python" >&2; exit 1 ;;
esac
if ! run_trusted_python -I -c \
  'import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)'; then
  echo "trusted production migration Python is unusable: $trusted_python" >&2
  exit 1
fi
# END production-migration-trusted-python-guard

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

for directory in "$root" "$root/uploads" "$evidence_dir" "$backup_root" "$runtime_api_dir" \
  "$(dirname "$rehearsal_evidence")"; do
  require_root_owned_path directory "$directory" 700
done
if [ -e "$cutover_root" ] || [ -L "$cutover_root" ]; then
  require_root_owned_path directory "$cutover_root" 700
else
  install -d -m 700 "$cutover_root"
fi
if [ -e "$candidate_runtime_root" ] || [ -L "$candidate_runtime_root" ]; then
  require_root_owned_path directory "$candidate_runtime_root" 700
else
  install -d -m 700 "$candidate_runtime_root"
fi
for protected_file in "$upload" "$checksum" "$runtime_env" "$runtime_compose" "$backup" "$backup.sha256" \
  "$rehearsal_evidence"; do
  require_root_owned_path file "$protected_file" 600
done

# Serialize production migration, rehearsals, and API/Ops release cutovers.
# The post-drain backup obtains the backup lock itself while this shared release
# lock remains held; this avoids nested-flock deadlock and still fails closed
# against a scheduled backup.
# BEGIN production-migration-cutover-locks
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
exec 6<>/run/lock/icao-production-release-change.lock
flock -n 6 || { echo 'a production API or Ops release change is still running' >&2; exit 1; }
# END production-migration-cutover-locks

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

# BEGIN production-migration-remote-cleanup
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
  case "$candidate_runtime_env" in
    "$candidate_runtime_root"/candidate-*.env)
      if [ "$candidate_runtime_env_created" = 1 ] \
        && ! rm -f "$candidate_runtime_env"; then
        echo "could not remove protected candidate runtime environment: $candidate_runtime_env" >&2
        cleanup_failed=1
      fi
      ;;
    *)
      echo 'candidate runtime environment cleanup path escaped its protected root' >&2
      cleanup_failed=1
      ;;
  esac
  for staged_runtime_file in "$runtime_env_next:$runtime_env_next_created" \
    "$runtime_compose_next:$runtime_compose_next_created"; do
    staged_path=${staged_runtime_file%:*}
    staged_created=${staged_runtime_file##*:}
    case "$staged_path" in
      "$runtime_api_dir"/.env.next-*|"$runtime_api_dir"/docker-compose.yml.next-*)
        if [ "$staged_created" = 1 ] && ! rm -f "$staged_path"; then
          echo "could not remove staged live runtime file: $staged_path" >&2
          cleanup_failed=1
        fi
        ;;
      *)
        echo 'staged live runtime cleanup path escaped its protected directory' >&2
        cleanup_failed=1
        ;;
    esac
  done
  if [ "$runtime_source_next" != "$runtime_source.next" ]; then
    echo 'runtime source staging cleanup path is invalid' >&2
    cleanup_failed=1
  elif [ "$runtime_source_next_created" = 1 ]; then
    if [ -L "$runtime_source_next" ]; then
      rm -f "$runtime_source_next" || cleanup_failed=1
      echo 'runtime source staging path became a symlink' >&2
      cleanup_failed=1
    elif [ -d "$runtime_source_next" ]; then
      rm -rf "$runtime_source_next" || cleanup_failed=1
    elif [ -e "$runtime_source_next" ]; then
      rm -f "$runtime_source_next" || cleanup_failed=1
      echo 'runtime source staging path had an unexpected type' >&2
      cleanup_failed=1
    fi
  fi
  if ! cleanup_migration_image; then cleanup_failed=1; fi
  for cleanup_path in "$work_dir" "$upload" "$checksum" "$candidate_runtime_env" \
    "$runtime_env_next" "$runtime_compose_next" "$runtime_source_next"; do
    if [ -e "$cleanup_path" ] || [ -L "$cleanup_path" ]; then
      echo "production migration path still exists after cleanup: $cleanup_path" >&2
      cleanup_failed=1
    fi
  done
  exit "$cleanup_failed"
)
# END production-migration-remote-cleanup

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
  recovery_validation_command=unavailable_post_drain_backup_not_created
  case "$cutover_backup_name" in
    icao-*.dump)
      recovery_validation_command="/bin/sh /opt/icao/runtime/backup-tools/current/restore-isolated.sh $backup_root/$cutover_backup_name"
      ;;
  esac
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
  if [ "$cleanup_in_progress" = 1 ]; then
    trap '' HUP INT TERM
  else
    trap 'exit 1' HUP INT TERM
  fi
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
    'backup_role=pre_cutover_isolated_rehearsal_only' \
    "cutover_backup_name=$cutover_backup_name" \
    "cutover_backup_sha256=$cutover_backup_sha" \
    "drain_completed_at=$drain_completed_at" \
    "cutover_backup_completed_at=$cutover_backup_completed_at" \
    "old_running_image=$old_running_image" \
    "old_running_release_id=$old_running_release_id" \
    "old_api_exit_state=$old_api_exit_state" \
    "old_api_drain_started=$old_api_drain_started" \
    "old_api_drained=$old_api_drained" \
    "old_api_restart_verified=$old_api_restart_verified" \
    "new_api_started=$new_api_started" \
    "cutover_committed=$cutover_committed" \
    "roll_forward_only=$roll_forward_only" \
    "failure_semantics=$failure_semantics" \
    "failure_origin_stage=$failure_origin_stage" \
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
    "rehearsal_schema_contract_sha256=$rehearsal_schema_contract_sha" \
    "schema_contract_sha256=$schema_contract_sha" \
    "cleanup_verified=$cleanup_verified" \
    'automatic_production_restore=forbidden' \
    "recovery_validation_command=$recovery_validation_command" \
    'production_recovery=pre_migration_failure_may_restart_old_api;after_migration_start_roll_forward_only_keep_old_api_closed' \
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

# BEGIN production-migration-cutover-failure-policy
enforce_cutover_failure_policy() {
  if [ "$cutover_committed" = 1 ]; then
    failure_semantics=post_cutover_housekeeping_failure_new_api_left_active
    return 0
  fi
  if [ "$old_api_drain_started" != 1 ]; then
    failure_semantics=pre_drain_failure_old_api_unchanged
    return 0
  fi
  if [ "$migration_started" = 0 ]; then
    stage=pre_migration_old_api_restart
    # A client-side interruption can leave dockerd completing the original
    # stop asynchronously. Finish one full idempotent stop before restarting;
    # never mix repeated Running observations with start attempts.
    docker stop --time 60 icao-api >/dev/null || {
      echo 'CRITICAL: the pre-migration API could not be brought to a stopped state before recovery.' >&2
      return 1; }
    [ "$(docker inspect -f '{{.State.Running}}' icao-api 2>/dev/null || true)" = false ] || {
      echo 'CRITICAL: the pre-migration API is still running after its recovery stop window.' >&2
      return 1; }
    old_api_exit_state=$(docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}}' icao-api 2>/dev/null || true)
    printf '%s\n' "$old_api_exit_state" | grep -Eq '^[0-9]+ (true|false)$' || {
      echo 'CRITICAL: the pre-migration API recovery exit/OOM state is invalid.' >&2
      return 1; }
    docker start icao-api >/dev/null || {
      echo 'CRITICAL: the pre-migration API could not be restarted after reaching a stopped state.' >&2
      return 1; }
    ready=0
    for attempt in $(seq 1 30); do
      if curl -fsS http://127.0.0.1:3101/health/ready >/dev/null; then ready=1; break; fi
      sleep 2
    done
    [ "$ready" = 1 ] || {
      echo 'CRITICAL: the pre-migration API did not become ready after restart.' >&2
      return 1; }
    [ "$(docker inspect -f '{{.Image}}' icao-api 2>/dev/null || true)" = "$old_running_image" ] || {
      echo 'CRITICAL: the pre-migration API image does not match the drained image.' >&2
      return 1; }
    [ "$(docker inspect -f '{{.State.Running}}' icao-api 2>/dev/null || true)" = true ] || {
      echo 'CRITICAL: the pre-migration API is not running after readiness succeeded.' >&2
      return 1; }
    recovered_release_id=$(curl -fsS -D - -o /dev/null http://127.0.0.1:3101/health/ready \
      | tr -d '\r' \
      | awk 'tolower($1) == "x-icao-api-version:" { print $2; exit }')
    [ "$recovered_release_id" = "$old_running_release_id" ] || {
      echo 'CRITICAL: the pre-migration API release header does not match the drained release.' >&2
      return 1; }
    old_api_restart_verified=1
    old_api_drained=0
    failure_semantics=pre_migration_failure_old_api_restored
    return 0
  fi

  # 0041 is roll-forward-only. Once any migration write may have occurred, the
  # previous API must never be restarted against the changed schema and no
  # backup may be restored automatically.
  stage=post_migration_fail_closed
  roll_forward_only=1
  failure_semantics=post_migration_roll_forward_only_api_closed
  if docker inspect icao-api >/dev/null 2>&1; then
    running_state=$(docker inspect -f '{{.State.Running}}' icao-api)
    if [ "$running_state" = true ]; then docker stop --time 30 icao-api >/dev/null; fi
    test "$(docker inspect -f '{{.State.Running}}' icao-api)" = false
  fi
  echo 'CRITICAL: migration may have started; the old API remains closed. Apply a reviewed forward-fix from a newer origin/main. Automatic database restore is forbidden.' >&2
}
# END production-migration-cutover-failure-policy

# BEGIN production-migration-cutover-cleanup-on-exit
cleanup_on_exit() {
  original_status=$?
  trap '' HUP INT TERM
  trap - EXIT
  set +e
  cleanup_in_progress=1
  failure_origin_stage=$stage
  final_status=$original_status
  if [ "$final_status" -eq 0 ]; then final_status=1; fi
  cleanup_failed=0
  if ! enforce_cutover_failure_policy; then
    stage=cutover_failure_policy_failed
    cleanup_failed=1
  fi
  if ! cleanup_remote_resources; then
    stage=cleanup_failed
    cleanup_failed=1
  fi
  if [ "$cleanup_failed" = 0 ]; then cleanup_verified=1; fi
  if ! failure_evidence=$(publish_evidence failed); then
    if [ "$cutover_committed" = 1 ]; then
      echo 'production migration cutover committed, but post-commit failure evidence could not be published; the new API remains active.' >&2
    else
      echo 'production migration failed and failure evidence could not be published' >&2
    fi
  elif [ "$cutover_committed" = 1 ]; then
    echo "production migration cutover committed; post-commit housekeeping failed and the new API remains active; evidence=$failure_evidence" >&2
  else
    echo "production migration failed closed; evidence=$failure_evidence" >&2
  fi
  # Never restore or overwrite the live database automatically. If migration
  # started, the evidence and fresh backup identify the separately authorized
  # forward-fix or verified-restore recovery path.
  exit "$final_status"
}
# END production-migration-cutover-cleanup-on-exit
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
test "$(evidence_value schema_contract_verified)" = 1
rehearsal_schema_contract_sha=$(evidence_value schema_contract_sha256)
case "$rehearsal_schema_contract_sha" in
  ''|*[!a-f0-9]*) echo 'rehearsal schema contract SHA is invalid' >&2; exit 1 ;;
esac
test "${#rehearsal_schema_contract_sha}" -eq 64
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
  --build-arg "ICAO_API_RELEASE_ID=$expected_image_release_id" \
  --build-arg "ICAO_NPM_REGISTRY=$build_npm_registry" \
  -t "$image" -f "$work_dir/infra/api/Dockerfile" "$work_dir"
image_created=1

# BEGIN production-migration-image-identity-guard
baked_image_env_file=$work_dir/baked-image-env.json
if ! docker inspect --type image --format '{{json .Config.Env}}' "$image" \
  > "$baked_image_env_file"; then
  echo "could not inspect production migration image identity: $image" >&2
  exit 1
fi
chmod 600 "$baked_image_env_file"
if ! run_trusted_python -I - "$baked_image_env_file" "$expected_image_release_id" <<'PYTHON'; then
import json
import sys

with open(sys.argv[1], encoding='utf-8') as input_file:
    entries = json.load(input_file)
expected = f'API_RELEASE_ID={sys.argv[2]}'
if not isinstance(entries, list) or any(type(entry) is not str for entry in entries):
    raise SystemExit(1)
identities = [entry for entry in entries if entry.startswith('API_RELEASE_ID=')]
if identities != [expected]:
    raise SystemExit(1)
PYTHON
  echo 'production migration image baked identity is missing, duplicated, or mismatched' >&2
  exit 1
fi
# END production-migration-image-identity-guard

# Build the exact environment that the candidate API will receive after the
# cutover. This preflight is intentionally before drain, backup, and every
# database write. services/api/src/config.ts rejects public or same-origin
# SUPABASE_URL values in production, so a public data-plane target fails here.
stage=candidate_configuration_preflight
test ! -e "$candidate_runtime_env" && test ! -L "$candidate_runtime_env"
candidate_runtime_env_created=1
set -C
exec 5>"$candidate_runtime_env"
set +C
chmod 600 "$candidate_runtime_env"
awk '$0 !~ /^API_RELEASE_ID=/' "$runtime_env" >&5
printf 'API_RELEASE_ID=%s\n' "$expected_image_release_id" >&5
exec 5>&-
require_root_owned_path file "$candidate_runtime_env" 600
# BEGIN production-migration-candidate-run-config-preflight
docker run --rm --network supabase_default --env-file "$candidate_runtime_env" \
  -e "API_RELEASE_ID=$expected_image_release_id" \
  -e NODE_OPTIONS= \
  -e NODE_PATH= \
  -e LD_PRELOAD= \
  -e LD_LIBRARY_PATH= \
  --entrypoint /usr/local/bin/node "$image" \
  services/api/dist/src/config-preflight.js
# END production-migration-candidate-run-config-preflight

stage=candidate_compose_preflight
test ! -e "$runtime_env_next" && test ! -L "$runtime_env_next"
test ! -e "$runtime_compose_next" && test ! -L "$runtime_compose_next"
runtime_env_next_created=1
install -m 600 "$candidate_runtime_env" "$runtime_env_next"
runtime_compose_next_created=1
install -m 600 "$work_dir/infra/api/docker-compose.runtime.yml" "$runtime_compose_next"
require_root_owned_path file "$runtime_env_next" 600
require_root_owned_path file "$runtime_compose_next" 600
docker compose --env-file "$runtime_env_next" -f "$runtime_compose_next" config >/dev/null

stage=production_target_verification
docker inspect -f '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' supabase-db \
  | grep -Fx 'true healthy' >/dev/null
# BEGIN production-migration-candidate-run-target
docker run --rm --network supabase_default --env-file "$runtime_env" \
  -e "API_RELEASE_ID=$expected_image_release_id" \
  -e NODE_OPTIONS= \
  -e NODE_PATH= \
  -e LD_PRELOAD= \
  -e LD_LIBRARY_PATH= \
  -e ICAO_PRODUCTION_DATABASE_NAME=postgres \
  --entrypoint /usr/local/bin/node "$image" -e '
    const url = new URL(process.env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) process.exit(1);
    if (url.hostname !== "db" || url.pathname !== "/postgres" || url.search || url.hash) process.exit(1);
    process.stdout.write("production_database_target_verified\n");
  '
# END production-migration-candidate-run-target

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
# BEGIN production-migration-candidate-run-pre-plan
docker run --rm --network supabase_default --env-file "$runtime_env" \
  -e "API_RELEASE_ID=$expected_image_release_id" \
  -e NODE_OPTIONS= \
  -e NODE_PATH= \
  -e LD_PRELOAD= \
  -e LD_LIBRARY_PATH= \
  --entrypoint /usr/local/bin/node "$image" \
  services/api/scripts/migration-plan.mjs --json > "$pre_plan"
# END production-migration-candidate-run-pre-plan
# BEGIN production-migration-evidence-parser-pre-plan
pre_summary=$(docker run --rm \
  -e NODE_OPTIONS= -e NODE_PATH= -e LD_PRELOAD= -e LD_LIBRARY_PATH= \
  --entrypoint /usr/local/bin/node -v "$pre_plan:/evidence.json:ro" "$image" -e '
  const p = require("/evidence.json");
  if (!p.safe || p.driftCount !== 0 || p.pendingCount < 1) process.exit(1);
  process.stdout.write(`${p.appliedCount}:${p.pendingCount}:${p.driftCount}`);
')
# END production-migration-evidence-parser-pre-plan
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

# BEGIN production-migration-cutover-drain-and-backup
# The running API is the only public writer. `docker stop` does not return until
# its graceful-stop window has completed, so no old in-flight request can cross
# the recovery point or migration boundary.
stage=cutover_preparation
test ! -e "$cutover_record_dir" && test ! -L "$cutover_record_dir"
install -d -m 700 "$cutover_record_dir"
old_api_state=$(docker inspect -f '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' icao-api)
test "$old_api_state" = 'true healthy'
old_running_image=$(docker inspect -f '{{.Image}}' icao-api)
expected_old_image=$(docker image inspect --format '{{.Id}}' icao-api:phase2a)
test "$old_running_image" = "$expected_old_image"
old_running_image_digest=${old_running_image#sha256:}
case "$old_running_image_digest" in
  ''|*[!a-f0-9]*) echo 'running API image identity is invalid before migration cutover' >&2; exit 1 ;;
esac
test "$old_running_image" = "sha256:$old_running_image_digest"
test "${#old_running_image_digest}" -eq 64
old_running_release_id=$(docker exec icao-api sh -lc 'printf "%s" "${API_RELEASE_ID:-unversioned}"')
case "$old_running_release_id" in
  ''|*[!A-Za-z0-9._-]*) echo 'running API release identity is invalid before migration cutover' >&2; exit 1 ;;
esac
curl -fsS http://127.0.0.1:3101/health/ready >/dev/null
observed_old_release_id=$(curl -fsS -D - -o /dev/null http://127.0.0.1:3101/health/ready \
  | tr -d '\r' \
  | awk 'tolower($1) == "x-icao-api-version:" { print $2; exit }')
test "$observed_old_release_id" = "$old_running_release_id"
printf '%s\n' "$old_running_image" > "$cutover_record_dir/old-api-image-id"
printf '%s\n' "$old_running_release_id" > "$cutover_record_dir/old-api-release-id"
cp "$runtime_compose" "$cutover_record_dir/docker-compose-before.yml"
chmod 600 "$cutover_record_dir"/*

stage=old_api_drain
old_api_drain_started=1
docker stop --time 60 icao-api >/dev/null
test "$(docker inspect -f '{{.State.Running}}' icao-api)" = false
old_api_exit_state=$(docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}}' icao-api)
case "$old_api_exit_state" in
  '0 false'|'143 false') ;;
  *) echo "old API did not complete a graceful non-OOM drain: $old_api_exit_state" >&2; exit 1 ;;
esac
old_api_drained=1
drain_completed_epoch=$(date +%s)
drain_completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

stage=post_drain_backup
test -f "$backup_tool" && test ! -L "$backup_tool"
cutover_backup=$(/bin/sh "$backup_tool")
case "$cutover_backup" in
  "$backup_root"/icao-*.dump) ;;
  *) echo 'post-drain production backup path escaped its protected root' >&2; exit 1 ;;
esac
cutover_backup_name=$(basename "$cutover_backup")
printf '%s\n' "$cutover_backup_name" \
  | grep -Eq '^icao-[0-9]{8}T[0-9]{6}Z-[0-9]+\.dump$' \
  || { echo 'post-drain production backup name is invalid' >&2; exit 1; }
require_root_owned_path file "$cutover_backup" 600
require_root_owned_path file "$cutover_backup.sha256" 600
cutover_backup_checksum_line=$(cat "$cutover_backup.sha256")
cutover_backup_sha=${cutover_backup_checksum_line%% *}
test "$cutover_backup_checksum_line" = "$cutover_backup_sha  $cutover_backup_name"
case "$cutover_backup_sha" in
  ''|*[!a-f0-9]*) echo 'post-drain production backup checksum is invalid' >&2; exit 1 ;;
esac
test "${#cutover_backup_sha}" -eq 64
(
  cd "$backup_root"
  sha256sum -c "$cutover_backup_name.sha256"
)
cutover_backup_mtime=$(stat -c %Y "$cutover_backup")
test "$cutover_backup_mtime" -ge "$drain_completed_epoch"
cutover_backup_completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '%s\n' "$cutover_backup_name" > "$cutover_record_dir/post-drain-backup-name"
printf '%s\n' "$cutover_backup_sha" > "$cutover_record_dir/post-drain-backup-sha256"
printf '%s\n' "$drain_completed_at" > "$cutover_record_dir/drain-completed-at"
printf '%s\n' "$cutover_backup_completed_at" > "$cutover_record_dir/post-drain-backup-completed-at"
chmod 600 "$cutover_record_dir"/*
# END production-migration-cutover-drain-and-backup

stage=production_migration_apply
roll_forward_only=1 migration_started=1
# BEGIN production-migration-candidate-run-apply
docker run --rm --network supabase_default --env-file "$runtime_env" \
  -e "API_RELEASE_ID=$expected_image_release_id" \
  -e NODE_OPTIONS= \
  -e NODE_PATH= \
  -e LD_PRELOAD= \
  -e LD_LIBRARY_PATH= \
  -e ICAO_PRODUCTION_MIGRATION_APPLY="apply:$source_sha:$expected_pre_plan:$expected_post_plan" \
  -e ICAO_PRODUCTION_MIGRATION_CONFIRM="$confirmation" \
  -e ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN="$expected_pre_plan" \
  -e ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN="$expected_post_plan" \
  -e ICAO_PRODUCTION_MIGRATION_SOURCE_SHA="$source_sha" \
  --entrypoint /usr/local/bin/node "$image" \
  services/api/scripts/migrate.mjs --production-apply
# END production-migration-candidate-run-apply
migration_completed=1

stage=post_plan_verification
# BEGIN production-migration-candidate-run-post-current
docker run --rm --network supabase_default --env-file "$runtime_env" \
  -e "API_RELEASE_ID=$expected_image_release_id" \
  -e NODE_OPTIONS= \
  -e NODE_PATH= \
  -e LD_PRELOAD= \
  -e LD_LIBRARY_PATH= \
  --entrypoint /usr/local/bin/node "$image" \
  services/api/scripts/migration-plan.mjs --require-current
# END production-migration-candidate-run-post-current
post_plan=$work_dir/post-plan.json
# BEGIN production-migration-candidate-run-post-plan
docker run --rm --network supabase_default --env-file "$runtime_env" \
  -e "API_RELEASE_ID=$expected_image_release_id" \
  -e NODE_OPTIONS= \
  -e NODE_PATH= \
  -e LD_PRELOAD= \
  -e LD_LIBRARY_PATH= \
  --entrypoint /usr/local/bin/node "$image" \
  services/api/scripts/migration-plan.mjs --json --require-current > "$post_plan"
# END production-migration-candidate-run-post-plan
# BEGIN production-migration-evidence-parser-post-plan
post_summary=$(docker run --rm \
  -e NODE_OPTIONS= -e NODE_PATH= -e LD_PRELOAD= -e LD_LIBRARY_PATH= \
  --entrypoint /usr/local/bin/node -v "$post_plan:/evidence.json:ro" "$image" -e '
  const p = require("/evidence.json");
  if (!p.current || !p.safe || p.pendingCount !== 0 || p.driftCount !== 0) process.exit(1);
  process.stdout.write(`${p.appliedCount}:${p.pendingCount}:${p.driftCount}`);
')
# END production-migration-evidence-parser-post-plan
test "$post_summary" = "$expected_post_plan"

stage=post_schema_verification
schema_contract=$work_dir/schema-contract.json
# BEGIN production-migration-candidate-run-schema
docker run --rm --network supabase_default --env-file "$runtime_env" \
  -e "API_RELEASE_ID=$expected_image_release_id" \
  -e NODE_OPTIONS= \
  -e NODE_PATH= \
  -e LD_PRELOAD= \
  -e LD_LIBRARY_PATH= \
  -e ICAO_PRODUCTION_DATABASE_NAME=postgres \
  --entrypoint /usr/local/bin/node "$image" \
  services/api/scripts/verify-production-schema-contract.mjs > "$schema_contract"
# END production-migration-candidate-run-schema
# BEGIN production-migration-evidence-parser-schema
docker run --rm \
  -e NODE_OPTIONS= -e NODE_PATH= -e LD_PRELOAD= -e LD_LIBRARY_PATH= \
  --entrypoint /usr/local/bin/node -v "$schema_contract:/evidence.json:ro" "$image" -e '
  const p = require("/evidence.json");
  if (p.status !== "verified" || p.readOnly !== true
      || p.requiredTables !== p.expectedPublicTables
      || p.expectedPublicTables !== 59 || p.actualPublicTables !== 59
      || p.unclassifiedPublicTables !== 0 || p.missingPublicTables !== 0
      || p.commerceProducts !== 5 || p.appleProductMappings !== 5
      || p.unvalidatedConstraints !== 0 || p.serverOnlyClientGrants !== 0
      || p.unexpectedPublicTableOwners !== 0 || p.defaultAclOwners !== 1
      || p.serverOnlyClientDefaultTableGrants !== 0
      || p.deviceDigestColumns !== 0) {
    console.error("production_migration_schema_contract_mismatch");
    process.exit(1);
  }
'
# END production-migration-evidence-parser-schema
schema_contract_sha=$(sha256sum "$schema_contract" | awk '{ print $1 }')

after_card_states=$(query_scalar 'select count(*) from public.user_card_states')
after_learning_records=$(query_scalar 'select count(*) from public.learning_records')
after_documents=$(query_scalar 'select count(*) from public.user_documents')
after_changes=$(query_scalar 'select count(*) from public.sync_changes')
after_auth_users=$(query_scalar 'select count(*) from auth.users')
after_migrations=$(query_scalar 'select count(*) from drizzle.__drizzle_migrations')
after_business_rows=$((after_card_states + after_learning_records + after_documents + after_changes))
test "$after_migrations" -eq "${expected_post_plan%%:*}"

# BEGIN production-migration-cutover-new-api
# From this point onward there is deliberately no rollback to the old API or to
# a pre-migration database image. Any failure is handled by the fail-closed
# policy above and a reviewed forward-fix from a newer origin/main.
stage=new_api_cutover
mv -- "$runtime_env_next" "$runtime_env"
runtime_env_next_created=0
mv -- "$runtime_compose_next" "$runtime_compose"
runtime_compose_next_created=0
require_root_owned_path file "$runtime_env" 600
require_root_owned_path file "$runtime_compose" 600
docker tag "$image" icao-api:phase2a
docker compose -f "$runtime_compose" up -d --force-recreate api

ready=0
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3101/health/ready >/dev/null; then ready=1; break; fi
  sleep 2
done
test "$ready" = 1
docker exec -e ICAO_LIVE_VERIFY_MODE=readiness icao-api \
  node services/api/scripts/verify-live.mjs
active_release_id=$(curl -fsS -D - -o /dev/null http://127.0.0.1:3101/health/ready \
  | tr -d '\r' \
  | awk 'tolower($1) == "x-icao-api-version:" { print $2; exit }')
test "$active_release_id" = "$expected_image_release_id"
cutover_committed=1 new_api_started=1
stage=cutover_committed

stage=runtime_source_housekeeping
rm -f "$baked_image_env_file" "$pre_plan" "$post_plan" "$schema_contract"
test ! -e "$runtime_source_next" && test ! -L "$runtime_source_next"
runtime_source_next_created=1
cp -a "$work_dir" "$runtime_source_next"
if [ -d "$runtime_source" ]; then
  mv "$runtime_source" "$cutover_record_dir/source-directory-before"
fi
mv "$runtime_source_next" "$runtime_source"
runtime_source_next_created=0
# END production-migration-cutover-new-api

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
