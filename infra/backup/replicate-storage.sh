#!/bin/sh
set -eu
umask 077

storage_root=${STORAGE_ROOT:-/opt/icao/runtime/supabase/volumes/storage}
replica_target=${STORAGE_REPLICA_TARGET:-}
identity_file=${STORAGE_REPLICA_IDENTITY_FILE:-/root/.ssh/readyoufife-storage-to-legacy}
known_hosts_file=${STORAGE_REPLICA_KNOWN_HOSTS_FILE:-/root/.ssh/known_hosts}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)

if [ -z "$replica_target" ]; then
  echo 'Storage replica is disabled: STORAGE_REPLICA_TARGET is not configured.'
  exit 0
fi

test -d "$storage_root"
test -r "$identity_file"
test -r "$known_hosts_file"
test "$(find "$storage_root" -type f | wc -l)" -gt 0
test "$(find "$storage_root" -type l | wc -l)" -eq 0

state=$(docker inspect -f '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' supabase-storage)
test "$state" = 'true healthy'

rsync -r \
  --checksum \
  --backup \
  --suffix=".bak-$timestamp" \
  --delay-updates \
  --exclude='*.bak-*' \
  -e "ssh -i $identity_file -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$known_hosts_file" \
  "$storage_root/" "$replica_target"
