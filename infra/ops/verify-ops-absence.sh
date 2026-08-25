#!/bin/sh

set -eu

check_once() {
  if docker inspect icao-ops-api >/dev/null 2>&1 \
    || docker inspect icao-ops-web >/dev/null 2>&1; then
    return 1
  fi
  if curl -sS --max-time 5 https://ops.readyoufife.com/ >/dev/null 2>&1 \
    || curl -sS --max-time 5 https://ops.readyoufife.com/health/ready >/dev/null 2>&1; then
    return 1
  fi
}

verify_absence() {
  consecutive_absent=0
  for attempt in $(seq 1 30); do
    if check_once; then
      consecutive_absent=$((consecutive_absent + 1))
      if [ "$consecutive_absent" -ge 3 ]; then
        echo 'Ops containers and public host are absent.'
        return 0
      fi
    else
      consecutive_absent=0
    fi
    sleep 2
  done
  echo 'Ops containers or the public host still exist after first-deployment rollback.' >&2
  return 1
}

self_test() {
  test_root=$(mktemp -d "${TMPDIR:-/tmp}/icao-ops-absence.XXXXXX")
  trap 'rm -rf "$test_root"' EXIT HUP INT TERM
  printf '#!/bin/sh\n[ "${FAKE_DOCKER_PRESENT:-0}" = 1 ]\n' > "$test_root/docker"
  printf '#!/bin/sh\n[ "${FAKE_CURL_SUCCESS:-0}" = 1 ]\n' > "$test_root/curl"
  chmod 700 "$test_root/docker" "$test_root/curl"

  if PATH="$test_root:$PATH" FAKE_DOCKER_PRESENT=1 FAKE_CURL_SUCCESS=0 \
    ICAO_OPS_ROLLBACK_INTERNAL=1 /bin/sh "$0" check-once; then
    echo 'The absence check accepted a surviving Ops container.' >&2
    return 1
  fi
  if PATH="$test_root:$PATH" FAKE_DOCKER_PRESENT=0 FAKE_CURL_SUCCESS=1 \
    ICAO_OPS_ROLLBACK_INTERNAL=1 /bin/sh "$0" check-once; then
    echo 'The absence check accepted a surviving public Ops host.' >&2
    return 1
  fi
  PATH="$test_root:$PATH" FAKE_DOCKER_PRESENT=0 FAKE_CURL_SUCCESS=0 \
    ICAO_OPS_ROLLBACK_INTERNAL=1 /bin/sh "$0" check-once
  echo 'Ops first-deployment rollback absence tests passed.'
}

action=${1:-verify}
if [ "$action" = self-test ]; then
  self_test
  exit 0
fi
if [ "${ICAO_OPS_ROLLBACK_INTERNAL:-}" != 1 ]; then
  echo 'Run the Ops absence verifier only through the reviewed rollback path.' >&2
  exit 1
fi
case "$action" in
  check-once) check_once ;;
  verify) verify_absence ;;
  *) echo 'Unknown Ops absence verification action.' >&2; exit 1 ;;
esac
