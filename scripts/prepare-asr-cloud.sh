#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"
load_release_runtime

REMOTE_STAGE=$(ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" "mktemp -d /opt/icao/runtime/releases/asr-cloud-XXXXXXXX")
cleanup() {
  ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" "rm -rf '$REMOTE_STAGE'" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

scp -i "$SSH_KEY" -q \
  "$PROJECT_ROOT/tools/prepare-asr-cloud.mjs" \
  "$PROJECT_ROOT/docs/ai/assets/asr-hotwords.json" \
  "$ECS_USER@$ECS_HOST:$REMOTE_STAGE/"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- "$REMOTE_STAGE" <<'REMOTE'
set -eu
stage=$1
environment=/opt/icao/runtime/api/.env
result=$stage/result.json
container_tool=/tmp/prepare-asr-cloud.mjs
container_asset=/tmp/asr-hotwords.json
container_result=/tmp/asr-cloud-result.json

docker cp "$stage/prepare-asr-cloud.mjs" "icao-api:$container_tool"
docker cp "$stage/asr-hotwords.json" "icao-api:$container_asset"
docker exec \
  -e "ASR_HOTWORDS_ASSET=$container_asset" \
  -e "ASR_SYNC_RESULT_PATH=$container_result" \
  icao-api node "$container_tool"
docker cp "icao-api:$container_result" "$result"
docker exec icao-api rm -f "$container_tool" "$container_asset" "$container_result"

docker run --rm -i -v "$stage:$stage:ro" -v "/opt/icao/runtime/api:/runtime-api" node:22-alpine \
  node - "$result" /runtime-api/.env <<'NODE'
const fs = require('fs');
const [resultPath, environmentPath] = process.argv.slice(2);
const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
const values = {
  AI_ASR_MODEL: result.model,
  AI_ASR_VOCABULARY_ID: result.vocabularyId,
  AI_ASR_HOTWORDS_VERSION: result.hotwordsVersion,
  AI_ASR_STAGING_BUCKET: result.bucket,
  AI_ASR_POLL_INTERVAL_MS: '2000',
  AI_ASR_TIMEOUT_MS: '55000',
  AI_ASR_SIGNED_URL_TTL_SECONDS: '600',
  AI_ASR_STALE_AUDIO_TTL_SECONDS: '86400',
  DASHSCOPE_ASR_BASE_URL: result.asrBaseUrl,
};
const original = fs.readFileSync(environmentPath, 'utf8');
const lines = original.split(/\r?\n/).filter(Boolean);
const remaining = lines.filter((line) => !Object.keys(values).some((key) => line.startsWith(`${key}=`)));
for (const [key, value] of Object.entries(values)) remaining.push(`${key}=${value}`);
const temporary = `${environmentPath}.asr-next`;
fs.writeFileSync(temporary, `${remaining.join('\n')}\n`, { mode: 0o600 });
fs.renameSync(temporary, environmentPath);
NODE

rm -f "$result"
REMOTE

echo 'ASR cloud resources prepared and protected runtime configuration updated.'
