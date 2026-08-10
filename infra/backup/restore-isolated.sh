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
(
  cd "$backup_dir"
  sha256sum -c "$backup_name.sha256"
)

name="icao-restore-test-$(date -u +%Y%m%dT%H%M%SZ)"
docker run --rm --name "$name" \
  --network supabase_default \
  -v "$backup:/backup.dump:ro" \
  -e PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}" \
  -e EXPECT_USER_DATA="${EXPECT_USER_DATA:-0}" \
  supabase/postgres:17.6.1.136 \
  sh -ec '
    dropdb -h db -U supabase_admin --if-exists --force icao_restore_test
    trap "dropdb -h db -U supabase_admin --if-exists --force icao_restore_test" EXIT
    createdb -h db -U supabase_admin icao_restore_test
    pg_restore -h db -U supabase_admin -d icao_restore_test --exit-on-error /backup.dump
    public_tables=$(psql -h db -U supabase_admin -d icao_restore_test -Atc "select count(*) from information_schema.tables where table_schema = '\''public'\''")
    auth_tables=$(psql -h db -U supabase_admin -d icao_restore_test -Atc "select count(*) from information_schema.tables where table_schema = '\''auth'\''")
    test "$public_tables" -ge 8
    test "$auth_tables" -gt 0
    if [ "$EXPECT_USER_DATA" = 1 ]; then
      card_states=$(psql -h db -U supabase_admin -d icao_restore_test -Atc "select count(*) from public.user_card_states")
      learning_records=$(psql -h db -U supabase_admin -d icao_restore_test -Atc "select count(*) from public.learning_records")
      documents=$(psql -h db -U supabase_admin -d icao_restore_test -Atc "select count(*) from public.user_documents")
      changes=$(psql -h db -U supabase_admin -d icao_restore_test -Atc "select count(*) from public.sync_changes")
      test "$card_states" -gt 0
      test "$learning_records" -gt 0
      test "$documents" -gt 0
      test "$changes" -gt 0
      printf "isolated_user_data_ok card_states=%s learning_records=%s documents=%s changes=%s\n" "$card_states" "$learning_records" "$documents" "$changes"
    fi
    printf "isolated_restore_ok public_tables=%s auth_tables=%s\n" "$public_tables" "$auth_tables"
  '
