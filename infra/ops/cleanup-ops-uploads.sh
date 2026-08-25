#!/bin/sh

set -eu
umask 077

read_uid() {
  stat -c %u "$1" 2>/dev/null || stat -f %u "$1"
}

read_mode() {
  stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"
}

read_mtime() {
  if modified_at=$(stat -c %Y "$1" 2>/dev/null); then
    printf '%s\n' "$modified_at"
  else
    stat -f %m "$1"
  fi
}

validate_private_dir() {
  checked_dir=$1
  expected_owner=$2
  [ -d "$checked_dir" ] && [ ! -L "$checked_dir" ] || return 1
  [ "$(read_uid "$checked_dir")" = "$expected_owner" ] || return 1
  [ "$(read_mode "$checked_dir")" = 700 ] || return 1
}

validate_private_file() {
  checked_file=$1
  expected_owner=$2
  [ -f "$checked_file" ] && [ ! -L "$checked_file" ] || return 1
  [ "$(read_uid "$checked_file")" = "$expected_owner" ] || return 1
  [ "$(read_mode "$checked_file")" = 600 ] || return 1
}

validate_stage() {
  stage_dir=$1
  upload_root=$2
  expected_owner=$3
  case "$stage_dir" in
    "$upload_root"/stage-*) ;;
    *) echo 'An Ops staging path escaped its upload root.' >&2; return 1 ;;
  esac
  stage_name=${stage_dir#"$upload_root"/}
  case "$stage_name" in
    ''|*[!A-Za-z0-9._-]*) echo 'An Ops staging path contains unsafe characters.' >&2; return 1 ;;
  esac
  validate_private_dir "$stage_dir" "$expected_owner" || {
    echo 'The Ops upload janitor refuses linked or insecure staging directories.' >&2
    return 1
  }
  unexpected=$(find "$stage_dir" -mindepth 1 -maxdepth 1 \
    ! -name source.tar.gz ! -name source.tar.gz.sha256 -print -quit)
  [ -z "$unexpected" ] || {
    echo 'The Ops upload janitor refuses unexpected staging entries.' >&2
    return 1
  }
  for candidate in "$stage_dir/source.tar.gz" "$stage_dir/source.tar.gz.sha256"; do
    [ -e "$candidate" ] || [ -L "$candidate" ] || continue
    validate_private_file "$candidate" "$expected_owner" || {
      echo 'The Ops upload janitor refuses non-regular, linked, or insecure upload files.' >&2
      return 1
    }
  done
}

validate_inputs() {
  upload_root=$1
  current_upload=$2
  current_checksum=$3
  if [ -n "${ICAO_OPS_UPLOAD_JANITOR_TEST_ROOT:-}" ]; then
    [ "$upload_root" = "$ICAO_OPS_UPLOAD_JANITOR_TEST_ROOT" ] || {
      echo 'Ops upload janitor test root is invalid.' >&2
      return 1
    }
    expected_owner=${ICAO_OPS_UPLOAD_JANITOR_EXPECTED_UID:-}
  else
    [ "$upload_root" = /opt/icao/runtime/releases/ops-uploads ] || {
      echo 'Ops upload janitor root is invalid.' >&2
      return 1
    }
    expected_owner=0
  fi
  case "$expected_owner" in
    ''|*[!0-9]*) echo 'Ops upload janitor owner is invalid.' >&2; return 1 ;;
  esac
  validate_private_dir "$upload_root" "$expected_owner" || {
    echo 'The Ops upload root must be a private real directory with the expected owner.' >&2
    return 1
  }
  case "$current_upload:$current_checksum" in
    "$upload_root"/stage-*/source.tar.gz:"$upload_root"/stage-*/source.tar.gz.sha256) ;;
    *) echo 'Current Ops upload paths are invalid.' >&2; return 1 ;;
  esac
  current_stage=${current_upload%/source.tar.gz}
  [ "$current_checksum" = "$current_upload.sha256" ] || {
    echo 'Current Ops upload paths do not share a staging directory.' >&2
    return 1
  }
  validate_stage "$current_stage" "$upload_root" "$expected_owner"

  unexpected=$(find "$upload_root" -mindepth 1 -maxdepth 1 ! -name 'stage-*' -print -quit)
  [ -z "$unexpected" ] || {
    echo 'The Ops upload janitor refuses unexpected upload-root entries.' >&2
    return 1
  }
}

cleanup_stale_uploads() {
  upload_root=$1
  current_upload=$2
  current_checksum=$3
  now=${4:-$(date +%s)}
  validate_inputs "$upload_root" "$current_upload" "$current_checksum"
  case "$now" in
    ''|*[!0-9]*) echo 'Ops upload janitor time is invalid.' >&2; return 1 ;;
  esac
  expected_owner=${ICAO_OPS_UPLOAD_JANITOR_EXPECTED_UID:-0}
  current_stage=${current_upload%/source.tar.gz}

  for candidate in "$upload_root"/stage-*; do
    [ -e "$candidate" ] || [ -L "$candidate" ] || continue
    validate_stage "$candidate" "$upload_root" "$expected_owner"
  done

  removed=0
  for candidate in "$upload_root"/stage-*; do
    [ -e "$candidate" ] || continue
    [ "$candidate" != "$current_stage" ] || continue
    modified_at=$(read_mtime "$candidate")
    case "$modified_at" in
      ''|*[!0-9]*) echo 'An Ops upload modification time is invalid.' >&2; return 1 ;;
    esac
    [ "$now" -ge "$modified_at" ] || continue
    age=$((now - modified_at))
    if [ "$age" -ge 86400 ]; then
      rm -f "$candidate/source.tar.gz" "$candidate/source.tar.gz.sha256"
      rmdir "$candidate"
      removed=$((removed + 1))
    fi
  done
  printf 'Ops upload janitor removed %s stale staging area(s).\n' "$removed"
}

make_test_stage() {
  stage_dir=$1
  mkdir -m 700 "$stage_dir"
  : > "$stage_dir/source.tar.gz"
  : > "$stage_dir/source.tar.gz.sha256"
  chmod 600 "$stage_dir/source.tar.gz" "$stage_dir/source.tar.gz.sha256"
}

self_test() {
  test_parent=$(mktemp -d "${TMPDIR:-/tmp}/icao-ops-upload-janitor.XXXXXX")
  trap 'rm -rf "$test_parent"' EXIT HUP INT TERM
  test_root=$test_parent/uploads
  mkdir -m 700 "$test_root"
  expected_owner=$(id -u)
  current_stage=$test_root/stage-current-token
  stale_stage=$test_root/stage-stale-token
  recent_stage=$test_root/stage-recent-token
  make_test_stage "$current_stage"
  make_test_stage "$stale_stage"
  make_test_stage "$recent_stage"
  current_upload=$current_stage/source.tar.gz
  current_checksum=$current_upload.sha256
  touch -t 202001010000 "$current_stage" "$stale_stage"
  test_now=$(date +%s)

  if ICAO_OPS_UPLOAD_JANITOR_TEST_ROOT="$test_root" \
    ICAO_OPS_UPLOAD_JANITOR_EXPECTED_UID="$expected_owner" \
    /bin/sh "$0" cleanup "$test_root" "$current_upload" "$current_checksum" "$test_now"; then
    echo 'The Ops upload janitor ran without the held-lock guard.' >&2
    return 1
  fi
  [ -d "$stale_stage" ] || {
    echo 'A lockless Ops upload janitor changed stale uploads.' >&2
    return 1
  }

  ICAO_OPS_UPLOAD_JANITOR_LOCK_HELD=1 ICAO_OPS_UPLOAD_JANITOR_TEST_ROOT="$test_root" \
    ICAO_OPS_UPLOAD_JANITOR_EXPECTED_UID="$expected_owner" \
    /bin/sh "$0" cleanup "$test_root" "$current_upload" "$current_checksum" "$test_now"
  [ -f "$current_upload" ] && [ -f "$current_checksum" ] && [ -d "$recent_stage" ] \
    && [ ! -e "$stale_stage" ] || {
      echo 'The Ops upload janitor did not preserve current/recent stages or remove a stale stage.' >&2
      return 1
    }

  unsafe_stage=$test_root/stage-unsafe-token
  make_test_stage "$unsafe_stage"
  rm -f "$unsafe_stage/source.tar.gz"
  ln -s "$current_upload" "$unsafe_stage/source.tar.gz"
  if ICAO_OPS_UPLOAD_JANITOR_LOCK_HELD=1 ICAO_OPS_UPLOAD_JANITOR_TEST_ROOT="$test_root" \
    ICAO_OPS_UPLOAD_JANITOR_EXPECTED_UID="$expected_owner" \
    /bin/sh "$0" cleanup "$test_root" "$current_upload" "$current_checksum" "$test_now"; then
    echo 'The Ops upload janitor accepted a linked upload entry.' >&2
    return 1
  fi
  [ -L "$unsafe_stage/source.tar.gz" ] && [ -f "$current_upload" ] || {
    echo 'The Ops upload janitor changed data while rejecting a linked entry.' >&2
    return 1
  }
  rm -f "$unsafe_stage/source.tar.gz" "$unsafe_stage/source.tar.gz.sha256"
  rmdir "$unsafe_stage"

  linked_root=$test_parent/linked-uploads
  ln -s "$test_root" "$linked_root"
  linked_current=$linked_root/$(basename "$current_stage")/source.tar.gz
  linked_checksum=$linked_current.sha256
  if ICAO_OPS_UPLOAD_JANITOR_LOCK_HELD=1 ICAO_OPS_UPLOAD_JANITOR_TEST_ROOT="$linked_root" \
    ICAO_OPS_UPLOAD_JANITOR_EXPECTED_UID="$expected_owner" \
    /bin/sh "$0" cleanup "$linked_root" "$linked_current" "$linked_checksum" "$test_now"; then
    echo 'The Ops upload janitor accepted a symbolic-link upload root.' >&2
    return 1
  fi
  [ -L "$linked_root" ] && [ -f "$current_upload" ] && [ -f "$current_checksum" ] || {
    echo 'The Ops upload janitor changed data while rejecting a linked root.' >&2
    return 1
  }
  echo 'Ops locked staged-upload janitor tests passed.'
}

action=${1:-}
if [ "$action" = self-test ]; then
  self_test
  exit 0
fi
if [ "${ICAO_OPS_UPLOAD_JANITOR_LOCK_HELD:-}" != 1 ]; then
  echo 'The Ops upload janitor requires the production release lock.' >&2
  exit 1
fi
case "$action" in
  cleanup) cleanup_stale_uploads "${2:-}" "${3:-}" "${4:-}" "${5:-}" ;;
  *) echo 'Unknown Ops upload janitor action.' >&2; exit 1 ;;
esac
