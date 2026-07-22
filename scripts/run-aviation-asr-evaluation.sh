#!/bin/sh

set -eu

if [ "$#" -lt 2 ] || [ "$#" -gt 4 ]; then
  echo 'Usage: run-aviation-asr-evaluation.sh RUN_MANIFEST OUTPUT [VOCABULARY_RESULT] [--retry-failed]' >&2
  exit 64
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"
load_release_runtime

RUN_MANIFEST=$1
OUTPUT=$2
VOCABULARY_RESULT=${3:-}
RETRY_FLAG=${4:-}

case "$RUN_MANIFEST" in
  /*) ;;
  *) RUN_MANIFEST=$PROJECT_ROOT/$RUN_MANIFEST ;;
esac
case "$OUTPUT" in
  /*) ;;
  *) OUTPUT=$PROJECT_ROOT/$OUTPUT ;;
esac
if [ -n "$VOCABULARY_RESULT" ]; then
  case "$VOCABULARY_RESULT" in
    /*) ;;
    *) VOCABULARY_RESULT=$PROJECT_ROOT/$VOCABULARY_RESULT ;;
  esac
fi
if [ -n "$RETRY_FLAG" ] && [ "$RETRY_FLAG" != '--retry-failed' ]; then
  echo "Unsupported retry option: $RETRY_FLAG" >&2
  exit 64
fi

test -f "$RUN_MANIFEST"
mkdir -p "$(dirname -- "$OUTPUT")"

HOTWORD_MODE=$(node -e "const f=require(process.argv[1]); process.stdout.write(f.run.hotwords.mode)" "$RUN_MANIFEST")
case "$HOTWORD_MODE" in
  none|configured) ;;
  candidate)
    if [ -z "$VOCABULARY_RESULT" ] || [ ! -f "$VOCABULARY_RESULT" ]; then
      echo 'Candidate mode requires an isolated vocabulary result file.' >&2
      exit 64
    fi
    ;;
  *)
    echo "Unsupported hotword mode: $HOTWORD_MODE" >&2
    exit 64
    ;;
esac

REMOTE_STAGE=$(ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" \
  "mktemp -d /opt/icao/runtime/releases/asr-eval-XXXXXXXX")
cleanup() {
  ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" "rm -rf '$REMOTE_STAGE'" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

scp -i "$SSH_KEY" -q "$PROJECT_ROOT/services/api/scripts/aviation-asr-batch.mjs" \
  "$ECS_USER@$ECS_HOST:$REMOTE_STAGE/aviation-asr-batch.mjs"
scp -i "$SSH_KEY" -q "$RUN_MANIFEST" "$ECS_USER@$ECS_HOST:$REMOTE_STAGE/run-manifest.json"
if [ -f "$OUTPUT" ]; then
  scp -i "$SSH_KEY" -q "$OUTPUT" "$ECS_USER@$ECS_HOST:$REMOTE_STAGE/existing-output.json"
fi
if [ -n "$VOCABULARY_RESULT" ]; then
  scp -i "$SSH_KEY" -q "$VOCABULARY_RESULT" "$ECS_USER@$ECS_HOST:$REMOTE_STAGE/vocabulary-result.json"
fi

set +e
ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- \
  "$REMOTE_STAGE" "$HOTWORD_MODE" "$RETRY_FLAG" <<'REMOTE'
set -eu
stage=$1
hotword_mode=$2
retry_flag=${3:-}
container_script=/app/services/api/scripts/aviation-asr-batch-eval.mjs
container_manifest=/tmp/aviation-asr-eval-manifest.json
container_output=/tmp/aviation-asr-eval-output.json

docker cp "$stage/aviation-asr-batch.mjs" "icao-api:$container_script"
docker cp "$stage/run-manifest.json" "icao-api:$container_manifest"
if [ -f "$stage/existing-output.json" ]; then
  docker cp "$stage/existing-output.json" "icao-api:$container_output"
fi

evaluation_vocabulary_id=
if [ "$hotword_mode" = candidate ]; then
  evaluation_vocabulary_id=$(docker run --rm -v "$stage:/stage:ro" node:22-alpine \
    node -e "const f=require('/stage/vocabulary-result.json'); if(f.purpose!=='evaluation'||!f.vocabularyId) process.exit(1); process.stdout.write(f.vocabularyId)")
fi

set +e
if [ -n "$retry_flag" ]; then
  docker exec \
    -e "ASR_EVAL_MANIFEST=$container_manifest" \
    -e "ASR_EVAL_OUTPUT=$container_output" \
    -e "ASR_EVAL_HOTWORD_MODE=$hotword_mode" \
    -e "ASR_EVAL_VOCABULARY_ID=$evaluation_vocabulary_id" \
    icao-api node "$container_script" "$retry_flag"
else
  docker exec \
    -e "ASR_EVAL_MANIFEST=$container_manifest" \
    -e "ASR_EVAL_OUTPUT=$container_output" \
    -e "ASR_EVAL_HOTWORD_MODE=$hotword_mode" \
    -e "ASR_EVAL_VOCABULARY_ID=$evaluation_vocabulary_id" \
    icao-api node "$container_script"
fi
status=$?
set -e

if docker exec icao-api test -f "$container_output"; then
  docker cp "icao-api:$container_output" "$stage/output.json"
fi
docker exec icao-api rm -f "$container_script" "$container_manifest" "$container_output"
exit "$status"
REMOTE
REMOTE_STATUS=$?
set -e

if scp -i "$SSH_KEY" -q "$ECS_USER@$ECS_HOST:$REMOTE_STAGE/output.json" "$OUTPUT.next"; then
  chmod 600 "$OUTPUT.next"
  mv "$OUTPUT.next" "$OUTPUT"
fi

if [ "$REMOTE_STATUS" -ne 0 ]; then
  echo "ASR evaluation stopped with status $REMOTE_STATUS; any recoverable output was saved to $OUTPUT." >&2
  exit "$REMOTE_STATUS"
fi

echo "ASR evaluation output saved to $OUTPUT."
