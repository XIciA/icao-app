#!/bin/sh
set -eu
umask 077

backup_root=${BACKUP_ROOT:-/opt/icao/backups/postgres}
replica_target=${BACKUP_REPLICA_TARGET:-}
identity_file=${BACKUP_REPLICA_IDENTITY_FILE:-/root/.ssh/readyoufife-backup-to-legacy}
known_hosts_file=${BACKUP_REPLICA_KNOWN_HOSTS_FILE:-/root/.ssh/known_hosts}

if [ -z "$replica_target" ]; then
  echo 'PostgreSQL replica is disabled: BACKUP_REPLICA_TARGET is not configured.'
  exit 0
fi

test -d "$backup_root"
test -r "$identity_file"
test -r "$known_hosts_file"

found=0
for backup in "$backup_root"/icao-*.dump; do
  test -f "$backup" || continue
  found=1
  backup_name=$(basename "$backup")
  (
    cd "$backup_root"
    sha256sum -c "$backup_name.sha256"
  )
done
test "$found" -eq 1

rsync -a \
  --ignore-existing \
  --chmod=D700,F600 \
  --include='icao-*.dump' \
  --include='icao-*.dump.sha256' \
  --exclude='*' \
  -e "ssh -i $identity_file -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$known_hosts_file" \
  "$backup_root/" "$replica_target"
