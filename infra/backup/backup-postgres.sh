#!/bin/sh
set -eu
umask 077

backup_root=${BACKUP_ROOT:-/opt/icao/backups/postgres}
retention=${BACKUP_RETENTION:-7}
exec 9>/run/lock/icao-postgres-backup.lock
if ! flock -n 9; then
  echo 'another PostgreSQL backup is already running' >&2
  exit 1
fi
timestamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
target="$backup_root/icao-$timestamp.dump"
partial="$backup_root/.icao-$timestamp.dump.partial.$$"
checksum_partial="$backup_root/.icao-$timestamp.dump.sha256.partial.$$"
published=0

cleanup() {
  rm -f "$partial" "$checksum_partial"
  if [ "$published" -ne 1 ]; then
    rm -f "$target" "$target.sha256"
  fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

install -d -m 700 "$backup_root"
state=$(docker inspect -f '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' supabase-db)
test "$state" = 'true healthy'

docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc > "$partial"
test -s "$partial"
docker exec -i supabase-db pg_restore --list < "$partial" >/dev/null
dump_digest=$(sha256sum "$partial" | awk '{ print $1 }')
printf '%s  %s\n' "$dump_digest" "$(basename "$target")" > "$checksum_partial"
chmod 600 "$partial" "$checksum_partial"
mv "$partial" "$target"
mv "$checksum_partial" "$target.sha256"
chmod 600 "$target.sha256"
published=1

find "$backup_root" -type f -name 'icao-*.dump' -mtime "+$retention" -delete
find "$backup_root" -type f -name 'icao-*.dump.sha256' -mtime "+$retention" -delete

trap - EXIT HUP INT TERM
printf '%s\n' "$target"
