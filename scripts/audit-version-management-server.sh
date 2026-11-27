#!/bin/sh
# Read-only inventory. Run on the authorized project server; do not source .env.
set -eu

printf '\nHost and disk\n'
hostname
date -u '+%Y-%m-%dT%H:%M:%SZ'
df -h /opt/icao

printf '\nRunning and stopped containers\n'
docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
printf '\nCompose projects\n'
docker compose ls --all
printf '\nContainer mount references (no environment values)\n'
docker ps -aq | while IFS= read -r id; do
  [ -n "$id" ] || continue
  docker inspect --format '{{.Name}} image={{.Image}} project={{index .Config.Labels "com.docker.compose.project"}} {{range .Mounts}}mount={{.Type}}:{{.Source}}->{{.Destination}} {{end}}' "$id"
done

printf '\nImages and volumes (inventory only)\n'
docker image ls --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}'
docker volume ls
printf '\nProject directory sizes\n'
du -x -h --max-depth=2 /opt/icao 2>/dev/null || true
printf '\nPostgreSQL backup filenames and sizes\n'
if [ -d /opt/icao/backups/postgres ]; then
  find /opt/icao/backups/postgres -maxdepth 1 -type f -name 'icao-*.dump*' -printf '%TY-%Tm-%Td %TH:%TM %s %f\n' | sort
fi
printf '\nBackup timers\n'
if command -v systemctl >/dev/null 2>&1; then
  systemctl list-timers --all --no-pager | awk 'NR==1 || /icao|backup|NEXT|timers listed/'
fi
printf '\nNo deployment, database mutation, backup deletion or pruning was performed.\n'
