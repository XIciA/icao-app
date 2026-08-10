#!/bin/sh
set -eu
umask 077

backup_root=${BACKUP_ROOT:-/opt/icao/backups/postgres}
retention=${BACKUP_RETENTION:-7}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$backup_root/icao-$timestamp.dump"
partial="$backup_root/.icao-$timestamp.dump.partial.$$"
checksum_partial="$backup_root/.icao-$timestamp.dump.sha256.partial.$$"

cleanup() {
  rm -f "$partial" "$checksum_partial"
}
trap cleanup EXIT HUP INT TERM

install -d -m 700 "$backup_root"
state=$(docker inspect -f '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' supabase-db)
test "$state" = 'true healthy'

docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc > "$partial"
test -s "$partial"
docker exec -i supabase-db pg_restore --list < "$partial" >/dev/null
mv "$partial" "$target"
chmod 600 "$target"
(
  cd "$backup_root"
  sha256sum "$(basename "$target")"
) > "$checksum_partial"
mv "$checksum_partial" "$target.sha256"
chmod 600 "$target.sha256"

find "$backup_root" -type f -name 'icao-*.dump' -mtime "+$retention" -delete
find "$backup_root" -type f -name 'icao-*.dump.sha256' -mtime "+$retention" -delete

trap - EXIT HUP INT TERM
printf '%s\n' "$target"
