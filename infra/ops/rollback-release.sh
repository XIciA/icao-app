#!/bin/sh

set -eu
umask 077

if [ "${ICAO_OPS_ROLLBACK_INTERNAL:-}" != 1 ]; then
  echo 'Run Ops rollback only through scripts/deploy-ops-release.sh.' >&2
  exit 1
fi

attempt_dir=${1:-}
reason=${2:-}

case "$attempt_dir" in
  /opt/icao/runtime/releases/ops-*/attempts/*) ;;
  *) echo 'Ops rollback attempt directory is invalid.' >&2; exit 1 ;;
esac
case "$attempt_dir" in
  *[!A-Za-z0-9_./-]*|*..*) echo 'Ops rollback attempt directory contains unsafe characters.' >&2; exit 1 ;;
esac
case "$reason" in
  automatic|manual) ;;
  *) echo 'Ops rollback reason must be automatic or manual.' >&2; exit 1 ;;
esac

if [ ! -d "$attempt_dir" ] || [ -L "$attempt_dir" ]; then
  echo 'Ops rollback evidence directory is missing or unsafe.' >&2
  exit 1
fi
if [ -e "$attempt_dir/rollback-used" ]; then
  echo 'This Ops rollback snapshot has already been consumed.' >&2
  exit 1
fi

runtime_root=/opt/icao/runtime/ops
runtime_env=/opt/icao/runtime/ops-api/.env
runtime_compose=$runtime_root/docker-compose.yml
gateway_root=/opt/icao/runtime/gateway
gateway_caddy=$gateway_root/Caddyfile
gateway_compose=$gateway_root/docker-compose.yml

for required in \
  "$attempt_dir/runtime-env-before" \
  "$attempt_dir/gateway-caddy-before" \
  "$attempt_dir/gateway-compose-before" \
  "$attempt_dir/previous-state" \
  "$attempt_dir/release-id" \
  "$attempt_dir/source-sha" \
  "$attempt_dir/snapshot-checksums.sha256"
do
  if [ ! -f "$required" ] || [ -L "$required" ]; then
    echo 'Ops rollback snapshot is incomplete.' >&2
    exit 1
  fi
done
if [ ! -f "$attempt_dir/ops-compose-before" ] && [ ! -f "$attempt_dir/ops-compose-before.absent" ]; then
  echo 'Ops rollback compose snapshot is incomplete.' >&2
  exit 1
fi
(
  cd "$attempt_dir"
  sha256sum -c snapshot-checksums.sha256
)

previous_state=$(cat "$attempt_dir/previous-state")
release_id=$(cat "$attempt_dir/release-id")
source_sha=$(cat "$attempt_dir/source-sha")
case "$previous_state" in
  absent|running) ;;
  *) echo 'Ops rollback state is invalid.' >&2; exit 1 ;;
esac
case "$release_id" in
  ''|*[!A-Za-z0-9._-]*) echo 'Ops rollback release identity is invalid.' >&2; exit 1 ;;
esac
case "$source_sha" in
  ''|*[!A-Fa-f0-9]*) echo 'Ops rollback source SHA is invalid.' >&2; exit 1 ;;
esac

if [ "$previous_state" = running ]; then
  for required in "$attempt_dir/previous-api-image-tag" "$attempt_dir/previous-web-image-tag"; do
    if [ ! -f "$required" ] || [ -L "$required" ]; then
      echo 'Ops rollback image snapshot is incomplete.' >&2
      exit 1
    fi
  done
  previous_api_image_tag=$(cat "$attempt_dir/previous-api-image-tag")
  previous_web_image_tag=$(cat "$attempt_dir/previous-web-image-tag")
  case "$previous_api_image_tag" in
    icao-ops-api:rollback-*) ;;
    *) echo 'Ops API rollback tag is invalid.' >&2; exit 1 ;;
  esac
  case "$previous_web_image_tag" in
    icao-ops-web:rollback-*) ;;
    *) echo 'Ops Web rollback tag is invalid.' >&2; exit 1 ;;
  esac
  docker image inspect "$previous_api_image_tag" >/dev/null
  docker image inspect "$previous_web_image_tag" >/dev/null
fi

rollback_failed=0
docker rm -f icao-ops-api icao-ops-web >/dev/null 2>&1 || true
install -d -m 700 "$runtime_root" "$(dirname "$runtime_env")" "$gateway_root" || rollback_failed=1
install -m 600 "$attempt_dir/runtime-env-before" "$runtime_env" || rollback_failed=1
if [ -f "$attempt_dir/ops-compose-before" ]; then
  install -m 600 "$attempt_dir/ops-compose-before" "$runtime_compose" || rollback_failed=1
else
  rm -f "$runtime_compose" || rollback_failed=1
fi
install -m 644 "$attempt_dir/gateway-caddy-before" "$gateway_caddy" || rollback_failed=1
install -m 600 "$attempt_dir/gateway-compose-before" "$gateway_compose" || rollback_failed=1

if [ "$previous_state" = running ]; then
  docker tag "$previous_api_image_tag" icao-ops-api:production || rollback_failed=1
  docker tag "$previous_web_image_tag" icao-ops-web:production || rollback_failed=1
  docker compose -f "$runtime_compose" up -d --force-recreate || rollback_failed=1
fi
docker compose -f "$gateway_compose" up -d --force-recreate caddy || rollback_failed=1

if [ "$previous_state" = running ]; then
  ready=0
  for attempt in $(seq 1 30); do
    if curl -fsS --max-time 5 http://127.0.0.1:3102/health/ready >/dev/null 2>&1 \
      && curl -fsS --max-time 5 http://127.0.0.1:4180/ >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 2
  done
  [ "$ready" -eq 1 ] || rollback_failed=1
fi

gateway_ready=0
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 10 https://api.readyoufife.com/health/ready >/dev/null 2>&1; then
    gateway_ready=1
    break
  fi
  sleep 2
done
[ "$gateway_ready" -eq 1 ] || rollback_failed=1

if [ "$rollback_failed" -ne 0 ]; then
  echo 'Ops rollback did not fully restore the previous runtime.' >&2
  exit 1
fi

rolled_back_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
evidence_tmp=$attempt_dir/rollback-evidence.json.tmp.$$
printf '{\n  "status": "rolled_back",\n  "reason": "%s",\n  "releaseId": "%s",\n  "sourceSha": "%s",\n  "rolledBackAt": "%s",\n  "previousState": "%s",\n  "publicApiHealth": "verified"\n}\n' \
  "$reason" "$release_id" "$source_sha" "$rolled_back_at" "$previous_state" > "$evidence_tmp"
chmod 600 "$evidence_tmp"
mv "$evidence_tmp" "$attempt_dir/rollback-evidence.json"
set -C
: > "$attempt_dir/rollback-used"
set +C
chmod 600 "$attempt_dir/rollback-used"

echo "Ops runtime rollback completed for release $release_id."
