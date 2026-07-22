#!/bin/sh

set -eu

if [ "$#" -ne 2 ]; then
  echo 'Usage: prepare-aviation-asr-vocabulary.sh evaluation|production OUTPUT' >&2
  exit 64
fi

PURPOSE=$1
OUTPUT=$2
case "$PURPOSE" in
  evaluation) COMMAND=prepare-evaluation ;;
  production) COMMAND=prepare-production ;;
  *)
    echo "Unsupported vocabulary purpose: $PURPOSE" >&2
    exit 64
    ;;
esac

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"
load_release_runtime

case "$OUTPUT" in
  /*) ;;
  *) OUTPUT=$PROJECT_ROOT/$OUTPUT ;;
esac
mkdir -p "$(dirname -- "$OUTPUT")"

REMOTE_STAGE=$(ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" \
  "mktemp -d /opt/icao/runtime/releases/asr-vocabulary-XXXXXXXX")
cleanup() {
  ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" "rm -rf '$REMOTE_STAGE'" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

scp -i "$SSH_KEY" -q "$PROJECT_ROOT/tools/asr-vocabulary.mjs" \
  "$ECS_USER@$ECS_HOST:$REMOTE_STAGE/asr-vocabulary.mjs"
scp -i "$SSH_KEY" -q "$PROJECT_ROOT/docs/ai/assets/asr-hotwords.json" \
  "$ECS_USER@$ECS_HOST:$REMOTE_STAGE/asr-hotwords.json"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- "$REMOTE_STAGE" "$COMMAND" <<'REMOTE'
set -eu
stage=$1
command=$2
container_tool=/tmp/asr-vocabulary.mjs
container_asset=/tmp/asr-hotwords.json
container_result=/tmp/asr-vocabulary-result.json
docker cp "$stage/asr-vocabulary.mjs" "icao-api:$container_tool"
docker cp "$stage/asr-hotwords.json" "icao-api:$container_asset"
docker exec \
  -e "ASR_HOTWORDS_ASSET=$container_asset" \
  -e "ASR_VOCABULARY_OUTPUT=$container_result" \
  icao-api node "$container_tool" "$command"
docker cp "icao-api:$container_result" "$stage/result.json"
docker exec icao-api rm -f "$container_tool" "$container_asset" "$container_result"
chmod 600 "$stage/result.json"
REMOTE

scp -i "$SSH_KEY" -q "$ECS_USER@$ECS_HOST:$REMOTE_STAGE/result.json" "$OUTPUT.next"
chmod 600 "$OUTPUT.next"
mv "$OUTPUT.next" "$OUTPUT"
echo "Isolated ASR vocabulary metadata saved to $OUTPUT."
