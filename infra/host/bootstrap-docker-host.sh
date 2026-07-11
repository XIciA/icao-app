#!/usr/bin/env bash

set -Eeuo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run this script as root in the ECS Workbench terminal."
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This bootstrap script supports Ubuntu/Debian hosts only."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y docker.io docker-compose-v2
systemctl enable --now docker

install -d -m 0750 /opt/icao /opt/icao/backups /opt/icao/runtime
touch /opt/icao/runtime/.gitkeep

docker --version
docker compose version
echo "Docker host bootstrap completed. No application, database, public port, credential, or Supabase service was created."
