#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo 'usage: restore-isolated.sh <backup.dump>' >&2
  exit 2
fi

backup=$1
test -f "$backup"
backup_dir=$(dirname "$backup")
backup_name=$(basename "$backup")
lock_file=${RESTORE_LOCK_FILE:-/run/lock/icao-postgres-restore.lock}
exec 9>"$lock_file"
if ! flock -n 9; then
  echo 'another isolated PostgreSQL restore is already running' >&2
  exit 1
fi
(
  cd "$backup_dir"
  sha256sum -c "$backup_name.sha256"
)

suffix="$(date -u +%Y%m%d%H%M%S)_$$"
database_name="icao_restore_$suffix"
container_name="icao-restore-${suffix%_*}-${suffix#*_}"
case "$database_name:$container_name" in
  *[!a-z0-9_:-]*) echo 'generated restore identity is invalid' >&2; exit 1 ;;
esac

PGPASSWORD=${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
export PGPASSWORD

# PGPASSWORD is inherited by name only; its value is never placed in the
# docker command arguments. Strong verification reads counts from the restored
# snapshot itself, so concurrent writes to the live database cannot invalidate
# otherwise correct backup evidence.
docker run --rm --name "$container_name" \
  --network supabase_default \
  -v "$backup:/backup.dump:ro" \
  -e PGPASSWORD \
  -e EXPECT_USER_DATA="${EXPECT_USER_DATA:-0}" \
  -e RESTORE_DB_NAME="$database_name" \
  supabase/postgres:17.6.1.136 \
  sh -ec '
    created=0
    cleanup_restore_database() {
      if [ "$created" = 1 ]; then
        dropdb -h db -U supabase_admin --if-exists --force "$RESTORE_DB_NAME"
      fi
    }
    createdb -h db -U supabase_admin "$RESTORE_DB_NAME"
    created=1
    trap cleanup_restore_database EXIT
    pg_restore -h db -U supabase_admin -d "$RESTORE_DB_NAME" --exit-on-error /backup.dump
    public_tables=$(psql -h db -U supabase_admin -d "$RESTORE_DB_NAME" -Atc "select count(*) from information_schema.tables where table_schema = '\''public'\''")
    auth_tables=$(psql -h db -U supabase_admin -d "$RESTORE_DB_NAME" -Atc "select count(*) from information_schema.tables where table_schema = '\''auth'\''")
    test "$public_tables" -ge 8
    test "$auth_tables" -gt 0
    if [ "$EXPECT_USER_DATA" = 1 ]; then
      card_states=$(psql -h db -U supabase_admin -d "$RESTORE_DB_NAME" -Atc "select count(*) from public.user_card_states")
      learning_records=$(psql -h db -U supabase_admin -d "$RESTORE_DB_NAME" -Atc "select count(*) from public.learning_records")
      documents=$(psql -h db -U supabase_admin -d "$RESTORE_DB_NAME" -Atc "select count(*) from public.user_documents")
      changes=$(psql -h db -U supabase_admin -d "$RESTORE_DB_NAME" -Atc "select count(*) from public.sync_changes")
      auth_users=$(psql -h db -U supabase_admin -d "$RESTORE_DB_NAME" -Atc "select count(*) from auth.users")
      migrations=$(psql -h db -U supabase_admin -d "$RESTORE_DB_NAME" -Atc "select count(*) from drizzle.__drizzle_migrations")
      business_rows=$((card_states + learning_records + documents + changes))
      test "$business_rows" -gt 0
      test "$auth_users" -gt 0
      test "$migrations" -gt 0
      printf "isolated_user_data_ok business_rows=%s card_states=%s learning_records=%s documents=%s changes=%s auth_users=%s migrations=%s\n" "$business_rows" "$card_states" "$learning_records" "$documents" "$changes" "$auth_users" "$migrations"
    fi
    printf "isolated_restore_ok public_tables=%s auth_tables=%s\n" "$public_tables" "$auth_tables"
  '
unset PGPASSWORD
