#!/bin/sh
set -eu

backup_root=${BACKUP_ROOT:-/opt/icao/backups/postgres}
retention=${BACKUP_RETENTION:-7}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$backup_root/icao-$timestamp.dump"

install -d -m 700 "$backup_root"
docker exec supabase-db pg_dump -U postgres -d postgres -Fc > "$target"
chmod 600 "$target"
sha256sum "$target" > "$target.sha256"
chmod 600 "$target.sha256"

find "$backup_root" -type f -name 'icao-*.dump' -mtime "+$retention" -delete
find "$backup_root" -type f -name 'icao-*.dump.sha256' -mtime "+$retention" -delete

printf '%s\n' "$target"
