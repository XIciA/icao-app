#!/bin/sh

set -eu
umask 077

script_path=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")

validate_release_dir() {
  checked_release_dir=$1
  if [ -n "${ICAO_OPS_RELEASE_STATE_TEST_ROOT:-}" ]; then
    case "$checked_release_dir" in
      "$ICAO_OPS_RELEASE_STATE_TEST_ROOT"/ops-*) ;;
      *) echo 'Ops test release directory is invalid.' >&2; return 1 ;;
    esac
  else
    case "$checked_release_dir" in
      /opt/icao/runtime/releases/ops-*) ;;
      *) echo 'Ops release directory is invalid.' >&2; return 1 ;;
    esac
  fi
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

resolve_active() {
  resolved_release_dir=$1
  validate_release_dir "$resolved_release_dir" || return 1
  resolved_active_file=$resolved_release_dir/active-rollback
  [ -f "$resolved_active_file" ] && [ ! -L "$resolved_active_file" ] || {
    echo 'The Ops release has no active rollback snapshot.' >&2
    return 1
  }
  resolved_attempt_dir=$(cat "$resolved_active_file")
  validate_attempt_dir "$resolved_attempt_dir" || return 1
  [ "${resolved_attempt_dir%/attempts/*}" = "$resolved_release_dir" ] || {
    echo 'The active Ops rollback pointer targets another release.' >&2
    return 1
  }
  [ ! -e "$resolved_attempt_dir/rollback-used" ] || {
    echo 'The active Ops rollback snapshot has already been consumed.' >&2
    return 1
  }
  printf '%s\n' "$resolved_attempt_dir"
}

activate() {
  activated_attempt_dir=$1
  validate_attempt_dir "$activated_attempt_dir"
  activated_release_dir=${activated_attempt_dir%/attempts/*}
  activated_active_file=$activated_release_dir/active-rollback
  [ ! -e "$activated_active_file" ] || {
    echo 'The Ops release already has an active rollback pointer.' >&2
    return 1
  }
  [ ! -e "$activated_attempt_dir/rollback-used" ] || {
    echo 'A consumed Ops rollback snapshot cannot be activated.' >&2
    return 1
  }
  state_tmp=$activated_attempt_dir/rollback-state.tmp.$$
  active_tmp=$activated_release_dir/active-rollback.tmp.$$
  [ ! -e "$state_tmp" ] && [ ! -e "$active_tmp" ] || {
    echo 'A temporary Ops rollback state path already exists.' >&2
    return 1
  }
  printf 'cutover-pending\n' > "$state_tmp"
  chmod 600 "$state_tmp"
  mv "$state_tmp" "$activated_attempt_dir/rollback-state"
  printf '%s\n' "$activated_attempt_dir" > "$active_tmp"
  chmod 600 "$active_tmp"
  mv "$active_tmp" "$activated_active_file"
}

assert_active() {
  asserted_attempt_dir=$1
  validate_attempt_dir "$asserted_attempt_dir"
  asserted_release_dir=${asserted_attempt_dir%/attempts/*}
  [ "$(resolve_active "$asserted_release_dir")" = "$asserted_attempt_dir" ] || {
    echo 'The requested Ops rollback snapshot is not active.' >&2
    return 1
  }
  [ -f "$asserted_attempt_dir/rollback-state" ] && [ ! -L "$asserted_attempt_dir/rollback-state" ] || {
    echo 'The active Ops rollback state is missing or unsafe.' >&2
    return 1
  }
  case "$(cat "$asserted_attempt_dir/rollback-state")" in
    cutover-pending|deployed) ;;
    *) echo 'The active Ops rollback state is invalid.' >&2; return 1 ;;
  esac
}

mark_deployed() {
  deployed_attempt_dir=$1
  assert_active "$deployed_attempt_dir"
  deployed_state_tmp=$deployed_attempt_dir/rollback-state.tmp.$$
  [ ! -e "$deployed_state_tmp" ] || {
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
  [ -f "$consumed_attempt_dir/rollback-evidence.json" ] \
    && [ ! -L "$consumed_attempt_dir/rollback-evidence.json" ] || {
      echo 'Verified Ops rollback evidence is required before consumption.' >&2
      return 1
    }
  [ ! -e "$consumed_attempt_dir/rollback-used" ] \
    && [ ! -e "$consumed_release_dir/last-consumed-rollback" ] || {
      echo 'The Ops rollback snapshot or release pointer was already consumed.' >&2
      return 1
    }
  mv "$consumed_release_dir/active-rollback" "$consumed_release_dir/last-consumed-rollback"
  if (set -C; : > "$consumed_attempt_dir/rollback-used") 2>/dev/null; then
    chmod 600 "$consumed_attempt_dir/rollback-used" || true
  fi
}

run_automatic() {
  automatic_attempt_dir=$1
  automatic_rollback_script=$2
  assert_active "$automatic_attempt_dir"
  automatic_release_dir=${automatic_attempt_dir%/attempts/*}
  [ "$automatic_rollback_script" = "$automatic_release_dir/source/infra/ops/rollback-release.sh" ] \
    && [ -f "$automatic_rollback_script" ] && [ ! -L "$automatic_rollback_script" ] || {
      echo 'The automatic Ops rollback script is invalid.' >&2
      return 1
    }
  if ICAO_OPS_ROLLBACK_INTERNAL=1 /bin/sh "$automatic_rollback_script" "$automatic_attempt_dir" automatic; then
    return 0
  fi
  [ "$(resolve_active "$automatic_release_dir")" = "$automatic_attempt_dir" ] || {
    echo 'Automatic Ops rollback failed and its retry pointer was not preserved.' >&2
    return 2
  }
  echo 'Automatic Ops rollback failed; the active snapshot remains available for a formal manual retry.' >&2
  return 1
}

self_test() {
  test_root=$(mktemp -d "${TMPDIR:-/tmp}/icao-ops-release-state.XXXXXX")
  trap 'rm -rf "$test_root"' EXIT HUP INT TERM
  test_release_dir=$test_root/ops-test
  test_attempt_dir=$test_release_dir/attempts/test-attempt
  test_rollback_script=$test_release_dir/source/infra/ops/rollback-release.sh
  mkdir -p "$test_attempt_dir" "$(dirname "$test_rollback_script")"
  printf '#!/bin/sh\nexit 17\n' > "$test_rollback_script"
  chmod 700 "$test_rollback_script"

  ICAO_OPS_RELEASE_STATE_INTERNAL=1 ICAO_OPS_RELEASE_STATE_TEST_ROOT="$test_root" \
    /bin/sh "$script_path" activate "$test_attempt_dir"
  if ICAO_OPS_RELEASE_STATE_INTERNAL=1 ICAO_OPS_RELEASE_STATE_TEST_ROOT="$test_root" \
    /bin/sh "$script_path" automatic "$test_attempt_dir" "$test_rollback_script"; then
    echo 'The simulated automatic rollback failure unexpectedly succeeded.' >&2
    return 1
  fi
  resolved=$(ICAO_OPS_RELEASE_STATE_INTERNAL=1 ICAO_OPS_RELEASE_STATE_TEST_ROOT="$test_root" \
    /bin/sh "$script_path" resolve "$test_release_dir")
  [ "$resolved" = "$test_attempt_dir" ] || {
    echo 'The automatic rollback failure did not preserve the formal retry pointer.' >&2
    return 1
  }

  printf '{}\n' > "$test_attempt_dir/rollback-evidence.json"
  ICAO_OPS_RELEASE_STATE_INTERNAL=1 ICAO_OPS_RELEASE_STATE_TEST_ROOT="$test_root" \
    /bin/sh "$script_path" consume "$test_attempt_dir"
  [ ! -e "$test_release_dir/active-rollback" ] \
    && [ -f "$test_release_dir/last-consumed-rollback" ] \
    && [ -f "$test_attempt_dir/rollback-used" ] || {
      echo 'A successful rollback did not consume its active pointer.' >&2
      return 1
    }
  echo 'Ops automatic rollback failure state test passed.'
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
  activate) activate "${2:-}" ;;
  assert-active) assert_active "${2:-}" ;;
  mark-deployed) mark_deployed "${2:-}" ;;
  consume) consume "${2:-}" ;;
  automatic) run_automatic "${2:-}" "${3:-}" ;;
  resolve) resolve_active "${2:-}" ;;
  *) echo 'Unknown Ops release-state action.' >&2; exit 1 ;;
esac
