#!/bin/sh

set -eu
umask 077

validate_inputs() {
  upload_root=$1
  current_upload=$2
  current_checksum=$3
  if [ -n "${ICAO_OPS_UPLOAD_JANITOR_TEST_ROOT:-}" ]; then
    [ "$upload_root" = "$ICAO_OPS_UPLOAD_JANITOR_TEST_ROOT" ] || {
      echo 'Ops upload janitor test root is invalid.' >&2
      return 1
    }
  else
    [ "$upload_root" = /opt/icao/runtime/releases/ops-uploads ] || {
      echo 'Ops upload janitor root is invalid.' >&2
      return 1
    }
  fi
  case "$current_upload:$current_checksum" in
    "$upload_root"/upload-*.tar.gz:"$upload_root"/upload-*.tar.gz.sha256) ;;
    *) echo 'Current Ops upload paths are invalid.' >&2; return 1 ;;
  esac
}

read_mtime() {
  if modified_at=$(stat -c %Y "$1" 2>/dev/null); then
    printf '%s\n' "$modified_at"
  else
    stat -f %m "$1"
  fi
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

  for candidate in "$upload_root"/upload-*.tar.gz "$upload_root"/upload-*.tar.gz.sha256; do
    [ -e "$candidate" ] || [ -L "$candidate" ] || continue
    case "$candidate" in
      *[!A-Za-z0-9_./-]*) echo 'An Ops upload path contains unsafe characters.' >&2; return 1 ;;
    esac
    [ -f "$candidate" ] && [ ! -L "$candidate" ] || {
      echo 'The Ops upload janitor refuses non-regular or linked entries.' >&2
      return 1
    }
  done

  removed=0
  for candidate in "$upload_root"/upload-*.tar.gz "$upload_root"/upload-*.tar.gz.sha256; do
    [ -e "$candidate" ] || continue
    [ "$candidate" != "$current_upload" ] && [ "$candidate" != "$current_checksum" ] || continue
    modified_at=$(read_mtime "$candidate")
    case "$modified_at" in
      ''|*[!0-9]*) echo 'An Ops upload modification time is invalid.' >&2; return 1 ;;
    esac
    [ "$now" -ge "$modified_at" ] || continue
    age=$((now - modified_at))
    if [ "$age" -ge 86400 ]; then
      rm -f "$candidate"
      removed=$((removed + 1))
    fi
  done
  printf 'Ops upload janitor removed %s stale file(s).\n' "$removed"
}

self_test() {
  test_root=$(mktemp -d "${TMPDIR:-/tmp}/icao-ops-upload-janitor.XXXXXX")
  trap 'rm -rf "$test_root"' EXIT HUP INT TERM
  current_upload=$test_root/upload-current-token.tar.gz
  current_checksum=$current_upload.sha256
  stale_upload=$test_root/upload-stale-token.tar.gz
  stale_checksum=$stale_upload.sha256
  recent_upload=$test_root/upload-recent-token.tar.gz
  : > "$current_upload"
  : > "$current_checksum"
  : > "$stale_upload"
  : > "$stale_checksum"
  : > "$recent_upload"
  touch -t 202001010000 "$current_upload" "$current_checksum" "$stale_upload" "$stale_checksum"
  test_now=$(date +%s)

  if ICAO_OPS_UPLOAD_JANITOR_TEST_ROOT="$test_root" \
    /bin/sh "$0" cleanup "$test_root" "$current_upload" "$current_checksum" "$test_now"; then
    echo 'The Ops upload janitor ran without the held-lock guard.' >&2
    return 1
  fi
  [ -f "$stale_upload" ] && [ -f "$stale_checksum" ] || {
    echo 'A lockless Ops upload janitor changed stale uploads.' >&2
    return 1
  }

  ICAO_OPS_UPLOAD_JANITOR_LOCK_HELD=1 ICAO_OPS_UPLOAD_JANITOR_TEST_ROOT="$test_root" \
    /bin/sh "$0" cleanup "$test_root" "$current_upload" "$current_checksum" "$test_now"
  [ -f "$current_upload" ] && [ -f "$current_checksum" ] && [ -f "$recent_upload" ] \
    && [ ! -e "$stale_upload" ] && [ ! -e "$stale_checksum" ] || {
      echo 'The Ops upload janitor did not preserve current/recent files or remove stale files.' >&2
      return 1
    }

  unsafe_link=$test_root/upload-unsafe-token.tar.gz
  ln -s "$current_upload" "$unsafe_link"
  if ICAO_OPS_UPLOAD_JANITOR_LOCK_HELD=1 ICAO_OPS_UPLOAD_JANITOR_TEST_ROOT="$test_root" \
    /bin/sh "$0" cleanup "$test_root" "$current_upload" "$current_checksum" "$test_now"; then
    echo 'The Ops upload janitor accepted a linked upload entry.' >&2
    return 1
  fi
  [ -L "$unsafe_link" ] && [ -f "$current_upload" ] || {
    echo 'The Ops upload janitor changed data while rejecting a linked entry.' >&2
    return 1
  }
  echo 'Ops locked upload janitor tests passed.'
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
