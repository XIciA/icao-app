#!/bin/sh

set -eu
umask 077

script_path=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")

validate_release_root() {
  checked_release_root=$1
  if [ -n "${ICAO_OPS_RELEASE_STATE_TEST_ROOT:-}" ]; then
    [ "$checked_release_root" = "$ICAO_OPS_RELEASE_STATE_TEST_ROOT" ] || {
      echo 'Ops test release root is invalid.' >&2
      return 1
    }
  else
    [ "$checked_release_root" = /opt/icao/runtime/releases ] || {
      echo 'Ops release root is invalid.' >&2
      return 1
    }
  fi
  [ -d "$checked_release_root" ] && [ ! -L "$checked_release_root" ]
}

validate_release_dir() {
  checked_release_dir=$1
  checked_release_root=$(dirname "$checked_release_dir")
  validate_release_root "$checked_release_root" || return 1
  case "$checked_release_dir" in
    "$checked_release_root"/ops-*) ;;
    *) echo 'Ops release directory is invalid.' >&2; return 1 ;;
  esac
  case "$checked_release_dir" in
    *[!A-Za-z0-9_./-]*|*..*) echo 'Ops release directory contains unsafe characters.' >&2; return 1 ;;
  esac
  [ -d "$checked_release_dir" ] && [ ! -L "$checked_release_dir" ]
}

validate_attempt_dir() {
  checked_attempt_dir=$1
  checked_release_dir=${checked_attempt_dir%/attempts/*}
  [ "$checked_release_dir" != "$checked_attempt_dir" ] || {
    echo 'Ops rollback attempt directory is invalid.' >&2
    return 1
  }
  validate_release_dir "$checked_release_dir" || return 1
  case "$checked_attempt_dir" in
    "$checked_release_dir"/attempts/*) ;;
    *) echo 'Ops rollback attempt escaped its release directory.' >&2; return 1 ;;
  esac
  case "$checked_attempt_dir" in
    *[!A-Za-z0-9_./-]*|*..*) echo 'Ops rollback attempt directory contains unsafe characters.' >&2; return 1 ;;
  esac
  [ -d "$checked_attempt_dir" ] && [ ! -L "$checked_attempt_dir" ] || {
    echo 'Ops rollback attempt directory is missing or unsafe.' >&2
    return 1
  }
}

read_attempt_release_id() {
  identity_attempt_dir=$1
  identity_file=$identity_attempt_dir/release-id
  [ -f "$identity_file" ] && [ ! -L "$identity_file" ] || {
    echo 'Ops rollback release identity is missing or unsafe.' >&2
    return 1
  }
  identity=$(cat "$identity_file")
  case "$identity" in
    ''|*[!A-Za-z0-9._-]*) echo 'Ops rollback release identity is invalid.' >&2; return 1 ;;
  esac
  printf '%s\n' "$identity"
}

read_rollback_state() {
  state_attempt_dir=$1
  state_file=$state_attempt_dir/rollback-state
  [ -f "$state_file" ] && [ ! -L "$state_file" ] || {
    echo 'The Ops rollback state is missing or unsafe.' >&2
    return 1
  }
  state=$(cat "$state_file")
  case "$state" in
    cutover-pending|deployed) printf '%s\n' "$state" ;;
    *) echo 'The Ops rollback state is invalid.' >&2; return 1 ;;
  esac
}

resolve_global() {
  resolved_release_root=$1
  validate_release_root "$resolved_release_root" || return 1
  resolved_active_file=$resolved_release_root/ops-active-rollback
  [ -f "$resolved_active_file" ] && [ ! -L "$resolved_active_file" ] || {
    echo 'There is no globally active Ops rollback snapshot.' >&2
    return 1
  }
  resolved_attempt_dir=$(cat "$resolved_active_file")
  validate_attempt_dir "$resolved_attempt_dir" || return 1
  [ "$(dirname "${resolved_attempt_dir%/attempts/*}")" = "$resolved_release_root" ] || {
    echo 'The global Ops rollback pointer escaped its release root.' >&2
    return 1
  }
  [ ! -e "$resolved_attempt_dir/rollback-used" ] && [ ! -L "$resolved_attempt_dir/rollback-used" ] || {
    echo 'The globally active Ops rollback snapshot has already been consumed.' >&2
    return 1
  }
  printf '%s\n' "$resolved_attempt_dir"
}

resolve_active() {
  resolved_release_dir=$1
  validate_release_dir "$resolved_release_dir" || return 1
  resolved_release_root=$(dirname "$resolved_release_dir")
  resolved_attempt_dir=$(resolve_global "$resolved_release_root")
  [ "${resolved_attempt_dir%/attempts/*}" = "$resolved_release_dir" ] || {
    echo 'Another Ops release owns the globally active rollback snapshot.' >&2
    return 1
  }
  printf '%s\n' "$resolved_attempt_dir"
}

snapshot_previous() {
  snapshot_attempt_dir=$1
  validate_attempt_dir "$snapshot_attempt_dir"
  snapshot_release_dir=${snapshot_attempt_dir%/attempts/*}
  snapshot_release_root=$(dirname "$snapshot_release_dir")
  previous_state_file=$snapshot_attempt_dir/previous-state
  [ -f "$previous_state_file" ] && [ ! -L "$previous_state_file" ] || {
    echo 'The previous Ops runtime state is missing or unsafe.' >&2
    return 1
  }
  previous_state=$(cat "$previous_state_file")
  case "$previous_state" in
    absent|running) ;;
    *) echo 'The previous Ops runtime state is invalid.' >&2; return 1 ;;
  esac

  previous_active=absent
  global_file=$snapshot_release_root/ops-active-rollback
  if [ -e "$global_file" ] || [ -L "$global_file" ]; then
    previous_active=$(resolve_global "$snapshot_release_root")
    [ "$(read_rollback_state "$previous_active")" = deployed ] || {
      echo 'An unresolved Ops cutover must be rolled back before another deployment.' >&2
      return 1
    }
  fi

  if [ "$previous_state" = absent ]; then
    [ "$previous_active" = absent ] || {
      echo 'An active Ops rollback snapshot exists while the runtime is absent.' >&2
      return 1
    }
  else
    previous_release_file=$snapshot_attempt_dir/previous-release-id
    [ -f "$previous_release_file" ] && [ ! -L "$previous_release_file" ] || {
      echo 'The previous Ops release identity is missing or unsafe.' >&2
      return 1
    }
    previous_release_id=$(cat "$previous_release_file")
    case "$previous_release_id" in
      ''|*[!A-Za-z0-9._-]*) echo 'The previous Ops release identity is invalid.' >&2; return 1 ;;
    esac
    if [ "$previous_active" != absent ]; then
      [ "$(read_attempt_release_id "$previous_active")" = "$previous_release_id" ] || {
        echo 'The globally active rollback snapshot does not match the running Ops release.' >&2
        return 1
      }
    fi
  fi

  previous_tmp=$snapshot_attempt_dir/previous-active-attempt.tmp.$$
  [ ! -e "$previous_tmp" ] && [ ! -L "$previous_tmp" ] \
    && [ ! -e "$snapshot_attempt_dir/previous-active-attempt" ] \
    && [ ! -L "$snapshot_attempt_dir/previous-active-attempt" ] || {
    echo 'The previous Ops active-pointer snapshot already exists.' >&2
    return 1
  }
  printf '%s\n' "$previous_active" > "$previous_tmp"
  chmod 600 "$previous_tmp"
  mv "$previous_tmp" "$snapshot_attempt_dir/previous-active-attempt"
}

activate() {
  activated_attempt_dir=$1
  validate_attempt_dir "$activated_attempt_dir"
  activated_release_dir=${activated_attempt_dir%/attempts/*}
  activated_release_root=$(dirname "$activated_release_dir")
  activated_global_file=$activated_release_root/ops-active-rollback
  previous_file=$activated_attempt_dir/previous-active-attempt
  [ -f "$previous_file" ] && [ ! -L "$previous_file" ] || {
    echo 'The previous Ops active-pointer snapshot is missing or unsafe.' >&2
    return 1
  }
  [ ! -e "$activated_attempt_dir/rollback-used" ] \
    && [ ! -L "$activated_attempt_dir/rollback-used" ] || {
    echo 'A consumed Ops rollback attempt cannot be activated again.' >&2
    return 1
  }
  expected_previous=$(cat "$previous_file")
  if [ "$expected_previous" = absent ]; then
    [ ! -e "$activated_global_file" ] && [ ! -L "$activated_global_file" ] || {
      echo 'The global Ops rollback owner changed before activation.' >&2
      return 1
    }
  else
    validate_attempt_dir "$expected_previous"
    [ "$(resolve_global "$activated_release_root")" = "$expected_previous" ] || {
      echo 'The global Ops rollback owner changed before activation.' >&2
      return 1
    }
    [ "$(read_rollback_state "$expected_previous")" = deployed ] || {
      echo 'Only a deployed Ops rollback snapshot may be superseded.' >&2
      return 1
    }
  fi

  state_tmp=$activated_attempt_dir/rollback-state.tmp.$$
  active_tmp=$activated_release_root/ops-active-rollback.tmp.$$
  [ ! -e "$state_tmp" ] && [ ! -L "$state_tmp" ] \
    && [ ! -e "$active_tmp" ] && [ ! -L "$active_tmp" ] || {
    echo 'A temporary Ops rollback state path already exists.' >&2
    return 1
  }
  printf 'cutover-pending\n' > "$state_tmp"
  chmod 600 "$state_tmp"
  mv "$state_tmp" "$activated_attempt_dir/rollback-state"
  printf '%s\n' "$activated_attempt_dir" > "$active_tmp"
  chmod 600 "$active_tmp"
  mv "$active_tmp" "$activated_global_file"
}

assert_active() {
  asserted_attempt_dir=$1
  validate_attempt_dir "$asserted_attempt_dir"
  asserted_release_dir=${asserted_attempt_dir%/attempts/*}
  [ "$(resolve_active "$asserted_release_dir")" = "$asserted_attempt_dir" ] || {
    echo 'The requested Ops rollback snapshot is not globally active.' >&2
    return 1
  }
  read_rollback_state "$asserted_attempt_dir" >/dev/null
}

mark_deployed() {
  deployed_attempt_dir=$1
  assert_active "$deployed_attempt_dir"
  deployed_state_tmp=$deployed_attempt_dir/rollback-state.tmp.$$
  [ ! -e "$deployed_state_tmp" ] && [ ! -L "$deployed_state_tmp" ] || {
    echo 'A temporary Ops deployed state path already exists.' >&2
    return 1
  }
  printf 'deployed\n' > "$deployed_state_tmp"
  chmod 600 "$deployed_state_tmp"
  mv "$deployed_state_tmp" "$deployed_attempt_dir/rollback-state"
}

consume() {
  consumed_attempt_dir=$1
  assert_active "$consumed_attempt_dir"
  consumed_release_dir=${consumed_attempt_dir%/attempts/*}
  consumed_release_root=$(dirname "$consumed_release_dir")
  consumed_global_file=$consumed_release_root/ops-active-rollback
  previous_file=$consumed_attempt_dir/previous-active-attempt
  [ -f "$consumed_attempt_dir/rollback-evidence.json" ] \
    && [ ! -L "$consumed_attempt_dir/rollback-evidence.json" ] \
    && [ -f "$previous_file" ] && [ ! -L "$previous_file" ] || {
      echo 'Verified rollback evidence and the previous pointer are required before consumption.' >&2
      return 1
    }
  [ ! -e "$consumed_attempt_dir/rollback-used" ] \
    && [ ! -L "$consumed_attempt_dir/rollback-used" ] || {
    echo 'This Ops rollback attempt was already consumed.' >&2
    return 1
  }

  previous_active=$(cat "$previous_file")
  if [ "$previous_active" = absent ]; then
    mv "$consumed_global_file" "$consumed_attempt_dir/rollback-used"
  else
    validate_attempt_dir "$previous_active"
    [ "$(read_rollback_state "$previous_active")" = deployed ] \
      && [ ! -e "$previous_active/rollback-used" ] \
      && [ ! -L "$previous_active/rollback-used" ] || {
        echo 'The previous Ops rollback pointer can no longer be restored.' >&2
        return 1
      }
    restored_tmp=$consumed_release_root/ops-active-rollback.tmp.$$
    [ ! -e "$restored_tmp" ] && [ ! -L "$restored_tmp" ] || {
      echo 'A temporary global Ops rollback pointer already exists.' >&2
      return 1
    }
    printf '%s\n' "$previous_active" > "$restored_tmp"
    chmod 600 "$restored_tmp"
    mv "$restored_tmp" "$consumed_global_file"
    if (set -C; printf '%s\n' "$consumed_attempt_dir" > "$consumed_attempt_dir/rollback-used") 2>/dev/null; then
      chmod 600 "$consumed_attempt_dir/rollback-used" || true
    fi
  fi
}

run_automatic() {
  automatic_attempt_dir=$1
  automatic_rollback_script=$2
  assert_active "$automatic_attempt_dir"
  automatic_release_dir=${automatic_attempt_dir%/attempts/*}
  automatic_release_root=$(dirname "$automatic_release_dir")
  [ "$automatic_rollback_script" = "$automatic_release_dir/source/infra/ops/rollback-release.sh" ] \
    && [ -f "$automatic_rollback_script" ] && [ ! -L "$automatic_rollback_script" ] || {
      echo 'The automatic Ops rollback script is invalid.' >&2
      return 1
    }
  if ICAO_OPS_ROLLBACK_INTERNAL=1 /bin/sh "$automatic_rollback_script" "$automatic_attempt_dir" automatic; then
    return 0
  fi
  [ "$(resolve_global "$automatic_release_root")" = "$automatic_attempt_dir" ] || {
    echo 'Automatic Ops rollback failed and its retry pointer was not preserved.' >&2
    return 2
  }
  echo 'Automatic Ops rollback failed; the active snapshot remains available for a formal manual retry.' >&2
  return 1
}

run_internal() {
  internal_test_root=$1
  shift
  ICAO_OPS_RELEASE_STATE_INTERNAL=1 ICAO_OPS_RELEASE_STATE_TEST_ROOT=$internal_test_root \
    /bin/sh "$script_path" "$@"
}

self_test() {
  test_root=$(mktemp -d "${TMPDIR:-/tmp}/icao-ops-release-state.XXXXXX")
  trap 'rm -rf "$test_root"' EXIT HUP INT TERM
  release_a=$test_root/ops-release-a
  release_b=$test_root/ops-release-b
  attempt_a1=$release_a/attempts/attempt-1
  attempt_a2=$release_a/attempts/attempt-2
  attempt_a3=$release_a/attempts/attempt-3
  attempt_b1=$release_b/attempts/attempt-1
  attempt_b_bad=$release_b/attempts/mismatched-previous-release
  rollback_a1=$release_a/source/infra/ops/rollback-release.sh
  mkdir -p "$attempt_a1" "$attempt_a2" "$attempt_a3" "$attempt_b1" "$attempt_b_bad" \
    "$(dirname "$rollback_a1")"
  printf '#!/bin/sh\nexit 17\n' > "$rollback_a1"
  chmod 700 "$rollback_a1"

  for attempt in "$attempt_a1" "$attempt_a2"; do
    printf 'absent\n' > "$attempt/previous-state"
    printf 'release-a\n' > "$attempt/release-id"
  done
  run_internal "$test_root" snapshot-previous "$attempt_a1"
  run_internal "$test_root" activate "$attempt_a1"
  if run_internal "$test_root" automatic "$attempt_a1" "$rollback_a1"; then
    echo 'The simulated automatic rollback failure unexpectedly succeeded.' >&2
    return 1
  fi
  [ "$(run_internal "$test_root" resolve "$release_a")" = "$attempt_a1" ] || {
    echo 'The automatic rollback failure did not preserve its global retry pointer.' >&2
    return 1
  }
  printf '{}\n' > "$attempt_a1/rollback-evidence.json"
  run_internal "$test_root" consume "$attempt_a1"

  run_internal "$test_root" snapshot-previous "$attempt_a2"
  run_internal "$test_root" activate "$attempt_a2"
  printf '{}\n' > "$attempt_a2/rollback-evidence.json"
  run_internal "$test_root" consume "$attempt_a2"
  [ -f "$attempt_a1/rollback-used" ] && [ -f "$attempt_a2/rollback-used" ] || {
    echo 'Same-release retries did not receive attempt-scoped consumption identities.' >&2
    return 1
  }
  if run_internal "$test_root" activate "$attempt_a1" 2>/dev/null; then
    echo 'A consumed Ops attempt was activated a second time.' >&2
    return 1
  fi

  printf 'absent\n' > "$attempt_a3/previous-state"
  printf 'release-a\n' > "$attempt_a3/release-id"
  run_internal "$test_root" snapshot-previous "$attempt_a3"
  run_internal "$test_root" activate "$attempt_a3"
  run_internal "$test_root" mark-deployed "$attempt_a3"

  printf 'running\n' > "$attempt_b_bad/previous-state"
  printf 'not-release-a\n' > "$attempt_b_bad/previous-release-id"
  printf 'release-b\n' > "$attempt_b_bad/release-id"
  if run_internal "$test_root" snapshot-previous "$attempt_b_bad" 2>/dev/null; then
    echo 'A deployment accepted a global rollback owner that did not match the running release.' >&2
    return 1
  fi

  printf 'running\n' > "$attempt_b1/previous-state"
  printf 'release-a\n' > "$attempt_b1/previous-release-id"
  printf 'release-b\n' > "$attempt_b1/release-id"
  run_internal "$test_root" snapshot-previous "$attempt_b1"
  run_internal "$test_root" activate "$attempt_b1"
  if run_internal "$test_root" resolve "$release_a" 2>/dev/null; then
    echo 'A stale release retained manual rollback ownership after a newer cutover began.' >&2
    return 1
  fi
  [ "$(run_internal "$test_root" resolve "$release_b")" = "$attempt_b1" ] || {
    echo 'The newer Ops cutover did not own the unique global rollback pointer.' >&2
    return 1
  }
  printf '{}\n' > "$attempt_b1/rollback-evidence.json"
  run_internal "$test_root" consume "$attempt_b1"
  [ "$(run_internal "$test_root" resolve "$release_a")" = "$attempt_a3" ] || {
    echo 'Rolling back the newer release did not restore the prior active rollback owner.' >&2
    return 1
  }
  [ -f "$attempt_b1/rollback-used" ] || {
    echo 'The cross-release rollback did not receive an attempt-scoped consumption identity.' >&2
    return 1
  }
  echo 'Ops global rollback ownership and same-release retry tests passed.'
}

action=${1:-}
if [ "$action" = self-test ]; then
  self_test
  exit 0
fi

if [ "${ICAO_OPS_RELEASE_STATE_INTERNAL:-}" != 1 ]; then
  echo 'Run Ops release-state actions only through the reviewed delivery scripts.' >&2
  exit 1
fi

case "$action" in
  snapshot-previous) snapshot_previous "${2:-}" ;;
  activate) activate "${2:-}" ;;
  assert-active) assert_active "${2:-}" ;;
  mark-deployed) mark_deployed "${2:-}" ;;
  consume) consume "${2:-}" ;;
  automatic) run_automatic "${2:-}" "${3:-}" ;;
  resolve) resolve_active "${2:-}" ;;
  *) echo 'Unknown Ops release-state action.' >&2; exit 1 ;;
esac
