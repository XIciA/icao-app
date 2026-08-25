#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"

SOURCE_ROOT=${ICAO_BACKUP_TOOLS_SOURCE_ROOT:-$PROJECT_ROOT}
SOURCE_ROOT=$(CDPATH= cd -- "$SOURCE_ROOT" && pwd)
SOURCE_GIT_ROOT=$(git -C "$SOURCE_ROOT" rev-parse --show-toplevel 2>/dev/null || true)
if [ "$SOURCE_GIT_ROOT" != "$SOURCE_ROOT" ]; then
  echo 'ICAO_BACKUP_TOOLS_SOURCE_ROOT must be the root of a Git worktree.' >&2
  exit 1
fi

node "$SOURCE_ROOT/tools/check-mainline-release.mjs" --root "$SOURCE_ROOT"

require_command ssh
require_command scp
require_command tar
require_command gzip
require_command mktemp
require_command openssl

ECS_HOST=${ICAO_ECS_HOST:-47.108.90.19}
ECS_USER=${ICAO_ECS_USER:-root}
SSH_KEY=${ICAO_ECS_SSH_KEY:-${HOME:?}/.ssh/icao_app_codex}
if [ ! -r "$SSH_KEY" ]; then
  echo "Project SSH key is not readable: $SSH_KEY" >&2
  exit 1
fi

SOURCE_SHA=$(git -C "$SOURCE_ROOT" rev-parse HEAD)
RELEASE_ID=${ICAO_BACKUP_TOOLS_RELEASE_ID:-$(printf '%.12s' "$SOURCE_SHA")}
case "$SOURCE_SHA" in
  ''|*[!A-Fa-f0-9]*) echo 'The backup tools source SHA is invalid.' >&2; exit 1 ;;
esac
case "$RELEASE_ID" in
  ''|*[!A-Za-z0-9._-]*) echo 'The backup tools release identity is invalid.' >&2; exit 1 ;;
esac

VERIFY_RESTORE=${ICAO_BACKUP_VERIFY_RESTORE:-1}
EXPECT_USER_DATA=${ICAO_BACKUP_EXPECT_USER_DATA:-1}
case "$VERIFY_RESTORE:$EXPECT_USER_DATA" in
  0:0|0:1|1:0|1:1) ;;
  *) echo 'ICAO_BACKUP_VERIFY_RESTORE and ICAO_BACKUP_EXPECT_USER_DATA must be 0 or 1.' >&2; exit 1 ;;
esac

ARCHIVE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/icao-backup-tools.XXXXXX")
ARCHIVE=$ARCHIVE_DIR/backup-tools.tar.gz
cleanup_local_archive() {
  rm -rf "$ARCHIVE_DIR"
}
trap cleanup_local_archive EXIT
trap 'exit 1' HUP INT TERM
(
  cd "$SOURCE_ROOT"
  git archive --format=tar HEAD infra/backup \
    | gzip -n > "$ARCHIVE"
)

REMOTE_ROOT=/opt/icao/runtime/backup-tools
UPLOAD_TOKEN=$(openssl rand -hex 16)
case "$UPLOAD_TOKEN" in
  ''|*[!A-Fa-f0-9]*) echo 'The backup tools upload identity is invalid.' >&2; exit 1 ;;
esac
REMOTE_UPLOAD=$REMOTE_ROOT/uploads/upload-$RELEASE_ID-$UPLOAD_TOKEN.tar.gz
REMOTE_CHECKSUM=$REMOTE_UPLOAD.sha256
ARCHIVE_SHA=$(shasum -a 256 "$ARCHIVE" | awk '{ print $1 }')
printf '%s  %s\n' "$ARCHIVE_SHA" "$(basename "$REMOTE_UPLOAD")" > "$ARCHIVE.sha256"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" \
  "install -d -m 700 '$REMOTE_ROOT' '$REMOTE_ROOT/releases' '$REMOTE_ROOT/rollbacks' '$REMOTE_ROOT/uploads'"
scp -i "$SSH_KEY" -q "$ARCHIVE" "$ECS_USER@$ECS_HOST:$REMOTE_UPLOAD"
scp -i "$SSH_KEY" -q "$ARCHIVE.sha256" "$ECS_USER@$ECS_HOST:$REMOTE_CHECKSUM"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- \
  "$RELEASE_ID" "$SOURCE_SHA" "$ARCHIVE_SHA" "$UPLOAD_TOKEN" "$VERIFY_RESTORE" "$EXPECT_USER_DATA" <<'REMOTE'
set -eu
umask 077

release_id=$1
source_sha=$2
archive_sha=$3
upload_token=$4
verify_restore=$5
expect_user_data=$6
root=/opt/icao/runtime/backup-tools
release_dir=$root/releases/$release_id
partial_dir=$root/.partial-$release_id-$$
upload=$root/uploads/upload-$release_id-$upload_token.tar.gz
checksum=$upload.sha256

case "$source_sha" in
  ''|*[!A-Fa-f0-9]*) echo 'remote backup source SHA is invalid' >&2; exit 1 ;;
esac
case "$archive_sha" in
  ''|*[!A-Fa-f0-9]*) echo 'remote backup archive SHA is invalid' >&2; exit 1 ;;
esac
case "$release_id" in
  ''|*[!A-Za-z0-9._-]*|*..*) echo 'remote backup release identity is invalid' >&2; exit 1 ;;
esac
case "$upload_token" in
  ''|*[!A-Fa-f0-9]*) echo 'remote backup upload identity is invalid' >&2; exit 1 ;;
esac
case "$partial_dir" in
  "$root"/.partial-*) ;;
  *) echo 'remote backup partial path escaped its root' >&2; exit 1 ;;
esac

exec 9>/run/lock/icao-backup-tools-install.lock
if ! flock -n 9; then
  echo 'another production backup tools installation is already running' >&2
  exit 1
fi

(
  cd "$(dirname "$checksum")"
  expected_checksum_line="$archive_sha  $(basename "$upload")"
  actual_checksum_line=$(cat "$(basename "$checksum")")
  test "$actual_checksum_line" = "$expected_checksum_line"
  sha256sum -c "$(basename "$checksum")"
)

validate_release() {
  candidate=$1
  for file in \
    backup-postgres.sh restore-isolated.sh replicate-postgres.sh replicate-storage.sh \
    icao-postgres-backup.service icao-postgres-backup.timer \
    icao-postgres-replica.service icao-postgres-replica.timer \
    icao-storage-replica.service icao-storage-replica.timer; do
    test -f "$candidate/$file"
  done
  if grep -R '/opt/icao/runtime/source/' "$candidate"/*.service >/dev/null; then
    echo 'backup service still depends on replaceable API source' >&2
    exit 1
  fi
  for contract in \
    'icao-postgres-backup.service|backup-postgres.sh' \
    'icao-postgres-replica.service|replicate-postgres.sh' \
    'icao-storage-replica.service|replicate-storage.sh'; do
    service=${contract%%|*}
    script=${contract#*|}
    grep -Fx "ExecStart=/bin/sh /opt/icao/runtime/backup-tools/current/$script" \
      "$candidate/$service" >/dev/null
  done
}

cleanup_partial() (
  set +e
  if [ -d "$partial_dir" ]; then
    rm -rf "$partial_dir"
  fi
  rm -f "$upload" "$checksum"
)

if [ -d "$release_dir" ]; then
  validate_release "$release_dir"
  grep -Fx "source_sha=$source_sha" "$release_dir/release-metadata" >/dev/null
  grep -Fx "archive_sha256=$archive_sha" "$release_dir/release-metadata" >/dev/null
  if [ "$verify_restore" = 1 ]; then
    grep -Fx 'preflight_restore_verified=1' "$release_dir/release-metadata" >/dev/null
  fi
  cleanup_partial
else
  trap cleanup_partial EXIT
  trap 'exit 1' HUP INT TERM
  install -d -m 700 "$partial_dir"
  tar -xzf "$upload" -C "$partial_dir" --strip-components=2
  validate_release "$partial_dir"
  chmod 700 "$partial_dir"/*.sh
  chmod 600 "$partial_dir"/*.service "$partial_dir"/*.timer

  latest=$(/bin/sh "$partial_dir/backup-postgres.sh")
  test -n "$latest"
  backup_name=$(basename "$latest")
  (
    cd /opt/icao/backups/postgres
    sha256sum -c "$backup_name.sha256"
  )

  if [ "$verify_restore" = 1 ]; then
    POSTGRES_PASSWORD=$(docker exec supabase-db printenv POSTGRES_PASSWORD)
    test -n "$POSTGRES_PASSWORD"
    export POSTGRES_PASSWORD
    EXPECT_USER_DATA=$expect_user_data /bin/sh "$partial_dir/restore-isolated.sh" "$latest"
    unset POSTGRES_PASSWORD
  fi

  {
    printf 'release_id=%s\n' "$release_id"
    printf 'source_sha=%s\n' "$source_sha"
    printf 'archive_sha256=%s\n' "$archive_sha"
    printf 'preflight_backup=%s\n' "$backup_name"
    printf 'preflight_restore_verified=%s\n' "$verify_restore"
    printf 'prepared_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$partial_dir/release-metadata"
  chmod 600 "$partial_dir/release-metadata"
  mv "$partial_dir" "$release_dir"
  rm -f "$upload" "$checksum"
  trap - EXIT HUP INT TERM
fi

rollback_dir=$root/rollbacks/$release_id-$(date -u +%Y%m%dT%H%M%SZ)-$$
install -d -m 700 "$rollback_dir"
previous_timer_enabled=$(systemctl is-enabled icao-postgres-backup.timer 2>/dev/null || true)
previous_timer_active=$(systemctl is-active icao-postgres-backup.timer 2>/dev/null || true)
previous_timer_enabled=${previous_timer_enabled:-not-found}
previous_timer_active=${previous_timer_active:-inactive}
case "$previous_timer_enabled:$previous_timer_active" in
  enabled:active|disabled:inactive|not-found:inactive) ;;
  *)
    echo "unsupported previous backup timer state: $previous_timer_enabled/$previous_timer_active" >&2
    exit 1
    ;;
esac
previous_current=
if [ -L "$root/current" ]; then
  previous_current=$(readlink "$root/current")
elif [ -e "$root/current" ]; then
  echo 'backup tools current path exists but is not a symlink' >&2
  exit 1
fi

for unit in "$release_dir"/*.service "$release_dir"/*.timer; do
  name=$(basename "$unit")
  target=/etc/systemd/system/$name
  if [ -f "$target" ]; then
    cp -p "$target" "$rollback_dir/$name"
  else
    : > "$rollback_dir/$name.absent"
  fi
done
printf '%s\n' "$previous_current" > "$rollback_dir/previous-current"
printf '%s\n' "$previous_timer_enabled" > "$rollback_dir/previous-timer-enabled"
printf '%s\n' "$previous_timer_active" > "$rollback_dir/previous-timer-active"

completed=0
rollback() {
  original_status=$?
  trap - EXIT
  if [ "$completed" = 1 ]; then
    return "$original_status"
  fi
  set +e
  rollback_failed=0
  systemctl stop icao-postgres-backup.timer >/dev/null 2>&1 || true
  case "$previous_timer_enabled" in
    enabled) ;;
    *) systemctl disable icao-postgres-backup.timer >/dev/null 2>&1 || true ;;
  esac
  for unit in "$release_dir"/*.service "$release_dir"/*.timer; do
    name=$(basename "$unit")
    target=/etc/systemd/system/$name
    if [ -f "$rollback_dir/$name" ]; then
      install -m 644 "$rollback_dir/$name" "$target.rollback-$release_id"
      mv -Tf "$target.rollback-$release_id" "$target" || rollback_failed=1
    elif [ -f "$rollback_dir/$name.absent" ]; then
      rm -f "$target" || rollback_failed=1
    fi
  done
  if [ -n "$previous_current" ]; then
    previous_link=$root/.previous-$release_id-$$
    ln -s "$previous_current" "$previous_link" || rollback_failed=1
    mv -Tf "$previous_link" "$root/current" || rollback_failed=1
  else
    rm -f "$root/current" || rollback_failed=1
  fi
  systemctl daemon-reload || rollback_failed=1
  case "$previous_timer_enabled" in
    enabled)
      systemctl enable icao-postgres-backup.timer >/dev/null || rollback_failed=1
      ;;
    *) ;;
  esac
  case "$previous_timer_active" in
    active|activating)
      systemctl start icao-postgres-backup.timer || rollback_failed=1
      ;;
    *)
      systemctl stop icao-postgres-backup.timer >/dev/null 2>&1 || true
      ;;
  esac
  restored_timer_enabled=$(systemctl is-enabled icao-postgres-backup.timer 2>/dev/null || true)
  restored_timer_active=$(systemctl is-active icao-postgres-backup.timer 2>/dev/null || true)
  restored_timer_enabled=${restored_timer_enabled:-not-found}
  restored_timer_active=${restored_timer_active:-inactive}
  test "$restored_timer_enabled" = "$previous_timer_enabled" || rollback_failed=1
  test "$restored_timer_active" = "$previous_timer_active" || rollback_failed=1
  if [ "$rollback_failed" -ne 0 ]; then
    echo 'production backup tools rollback did not fully restore the previous systemd state' >&2
    return 1
  fi
  return "$original_status"
}
trap rollback EXIT
trap 'exit 1' HUP INT TERM

next_link=$root/.current-$release_id-$$
ln -s "$release_dir" "$next_link"
mv -Tf "$next_link" "$root/current"
systemd-analyze verify "$release_dir"/*.service "$release_dir"/*.timer

for unit in "$release_dir"/*.service "$release_dir"/*.timer; do
  name=$(basename "$unit")
  target=/etc/systemd/system/$name
  install -m 644 "$unit" "$target.next-$release_id"
  mv -Tf "$target.next-$release_id" "$target"
done

systemctl daemon-reload
systemctl enable --now icao-postgres-backup.timer >/dev/null
systemctl start icao-postgres-backup.service
result=$(systemctl show icao-postgres-backup.service --property=Result --value)
status=$(systemctl show icao-postgres-backup.service --property=ExecMainStatus --value)
test "$result" = success
test "$status" = 0

backup_root=/opt/icao/backups/postgres
latest=$(find "$backup_root" -maxdepth 1 -type f -name 'icao-*.dump' -print | sort | tail -n 1)
test -n "$latest"
backup_name=$(basename "$latest")
(
  cd "$backup_root"
  sha256sum -c "$backup_name.sha256"
)
systemctl is-enabled icao-postgres-backup.timer >/dev/null
systemctl is-active icao-postgres-backup.timer >/dev/null

{
  printf 'installed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'systemd_backup=%s\n' "$backup_name"
  printf 'systemd_result=%s\n' "$result"
} >> "$release_dir/release-metadata"

completed=1
trap - EXIT HUP INT TERM
systemctl list-timers icao-postgres-backup.timer --no-pager
printf 'production_backup_tools_ok release=%s source_sha=%s backup=%s restore=%s\n' \
  "$release_id" "$source_sha" "$backup_name" "$verify_restore"
REMOTE

if [ "$VERIFY_RESTORE" = 1 ]; then
  echo "Production backup tools installed; fresh backup and isolated restore verified from origin/main: $SOURCE_SHA"
else
  echo "Production backup tools installed; fresh backup verified but isolated restore was explicitly skipped: $SOURCE_SHA"
fi

trap - EXIT HUP INT TERM
cleanup_local_archive
