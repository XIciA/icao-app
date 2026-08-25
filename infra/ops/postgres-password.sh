#!/bin/sh

load_ops_postgres_password() {
  unset POSTGRES_PASSWORD
  postgres_password_loaded=0
  if ! POSTGRES_PASSWORD=$(docker exec supabase-db printenv POSTGRES_PASSWORD); then
    unset POSTGRES_PASSWORD
    echo 'Could not read the production PostgreSQL password from the database container.' >&2
    return 1
  fi
  if [ -z "$POSTGRES_PASSWORD" ]; then
    unset POSTGRES_PASSWORD
    echo 'The production PostgreSQL password returned by the database container is empty.' >&2
    return 1
  fi
  export POSTGRES_PASSWORD
  postgres_password_loaded=1
}

clear_ops_postgres_password() {
  unset POSTGRES_PASSWORD
  postgres_password_loaded=0
}

postgres_password_self_test() {
  helper_path=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")
  test_root=$(mktemp -d "${TMPDIR:-/tmp}/icao-ops-postgres-password.XXXXXX")
  trap 'rm -rf "$test_root"' EXIT HUP INT TERM
  printf '%s\n' \
    '#!/bin/sh' \
    'case "${FAKE_POSTGRES_PASSWORD_RESULT:-}" in' \
    '  success) printf "test-only-password\\n" ;;' \
    '  empty) exit 0 ;;' \
    '  failure) exit 23 ;;' \
    '  *) exit 24 ;;' \
    'esac' > "$test_root/docker"
  chmod 700 "$test_root/docker"

  PATH="$test_root:$PATH" FAKE_POSTGRES_PASSWORD_RESULT=success HELPER_PATH="$helper_path" \
    /bin/sh -c '
      set -eu
      unset ICAO_OPS_POSTGRES_PASSWORD_SELF_TEST
      . "$HELPER_PATH"
      unset POSTGRES_PASSWORD
      load_ops_postgres_password
      [ "$postgres_password_loaded" = 1 ]
      [ "$POSTGRES_PASSWORD" = test-only-password ]
      clear_ops_postgres_password
      [ "$postgres_password_loaded" = 0 ]
      [ "${POSTGRES_PASSWORD+x}" != x ]
    '

  for result in failure empty; do
    if ! PATH="$test_root:$PATH" FAKE_POSTGRES_PASSWORD_RESULT="$result" HELPER_PATH="$helper_path" \
      /bin/sh -c '
        set -eu
        unset ICAO_OPS_POSTGRES_PASSWORD_SELF_TEST
        . "$HELPER_PATH"
        POSTGRES_PASSWORD=must-not-survive
        export POSTGRES_PASSWORD
        if load_ops_postgres_password; then exit 1; fi
        [ "$postgres_password_loaded" = 0 ]
        [ "${POSTGRES_PASSWORD+x}" != x ]
      '; then
      echo "The PostgreSQL password loader failed its $result negative test." >&2
      return 1
    fi
  done
  echo 'Ops PostgreSQL password lifecycle tests passed.'
}

if [ "${ICAO_OPS_POSTGRES_PASSWORD_SELF_TEST:-}" = 1 ] && [ "$#" -eq 0 ]; then
  postgres_password_self_test
fi
