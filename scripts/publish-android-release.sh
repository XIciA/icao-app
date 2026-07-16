#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"
load_release_runtime

CURRENT=$PROJECT_ROOT/.generated/release/current.json
MANIFEST=$PROJECT_ROOT/.generated/release/current-manifest.json
if [ ! -f "$CURRENT" ] || [ ! -f "$MANIFEST" ]; then
  echo 'Release metadata or workspace manifest is missing.' >&2
  exit 1
fi

DISPLAY_VERSION=$(node -p "require('$CURRENT').displayVersion")
RELEASE_ID=$(printf '%s' "$DISPLAY_VERSION" | tr -cd 'A-Za-z0-9._-')
ANDROID_DIR=$PROJECT_ROOT/.generated/releases/android/$DISPLAY_VERSION
ANDROID_METADATA=$ANDROID_DIR/android-release.json
if [ ! -f "$ANDROID_METADATA" ]; then
  echo "Android release metadata is missing: $ANDROID_METADATA" >&2
  exit 1
fi
APK_PATH=$(node -p "require('$ANDROID_METADATA').apkPath")
APK_SHA256=$(node -p "require('$ANDROID_METADATA').sha256")
VERSION_JSON=$ANDROID_DIR/version.json

CURRENT_PATH=$CURRENT METADATA_PATH=$ANDROID_METADATA MANIFEST_PATH=$MANIFEST VERSION_JSON_PATH=$VERSION_JSON \
  ICAO_RELEASE_NOTES=${ICAO_RELEASE_NOTES:-} node <<'NODE'
const fs = require('node:fs');
const current = JSON.parse(fs.readFileSync(process.env.CURRENT_PATH, 'utf8'));
const android = JSON.parse(fs.readFileSync(process.env.METADATA_PATH, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, 'utf8'));
const notes = process.env.ICAO_RELEASE_NOTES
  ? process.env.ICAO_RELEASE_NOTES.split('\n').map((line) => line.trim()).filter(Boolean)
  : ['同步当前代码中的 Android 功能更新。', '修复问题并提升学习体验。'];
const publicRelease = {
  displayVersion: current.displayVersion,
  marketingVersion: current.marketingVersion,
  versionCode: current.versionCode,
  updatedAt: current.createdAt,
  updatedAtDisplay: current.updatedAtDisplay,
  packageName: android.packageName,
  fileSizeBytes: android.fileSizeBytes,
  fileSizeDisplay: android.fileSizeDisplay,
  sha256: android.sha256,
  notes,
  apiFingerprint: manifest.apiFingerprint,
  gitHead: manifest.gitHead,
  workspaceFingerprint: manifest.workspaceFingerprint,
};
fs.writeFileSync(process.env.VERSION_JSON_PATH, `${JSON.stringify(publicRelease, null, 2)}\n`);
NODE

REMOTE_ROOT=/opt/icao/runtime/downloads/android
REMOTE_INCOMING=$REMOTE_ROOT/.incoming-$RELEASE_ID
REMOTE_RELEASE=$REMOTE_ROOT/releases/$RELEASE_ID
REMOTE_AUDIT=/opt/icao/runtime/releases/android-$RELEASE_ID
BACKUP_ID=$(date -u '+%Y%m%dT%H%M%SZ')

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" \
  "rm -rf '$REMOTE_INCOMING'; mkdir -p '$REMOTE_INCOMING' '$REMOTE_ROOT/releases' '$REMOTE_AUDIT'"
scp -i "$SSH_KEY" -q \
  "$APK_PATH" "$VERSION_JSON" \
  "$PROJECT_ROOT/infra/download-site/index.html" \
  "$PROJECT_ROOT/infra/download-site/styles.css" \
  "$PROJECT_ROOT/infra/download-site/release.js" \
  "$ECS_USER@$ECS_HOST:$REMOTE_INCOMING/"
scp -i "$SSH_KEY" -q "$MANIFEST" "$ECS_USER@$ECS_HOST:$REMOTE_AUDIT/workspace-manifest.json"

scp -i "$SSH_KEY" -q "$PROJECT_ROOT/infra/gateway/Caddyfile" "$ECS_USER@$ECS_HOST:/tmp/icao-Caddyfile-$BACKUP_ID"
scp -i "$SSH_KEY" -q "$PROJECT_ROOT/infra/gateway/docker-compose.yml" "$ECS_USER@$ECS_HOST:/tmp/icao-gateway-compose-$BACKUP_ID.yml"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- \
  "$RELEASE_ID" "$BACKUP_ID" "$(basename "$APK_PATH")" "$APK_SHA256" <<'REMOTE'
set -eu
release_id=$1
backup_id=$2
apk_name=$3
expected_sha=$4
root=/opt/icao/runtime/downloads/android
incoming=$root/.incoming-$release_id
release=$root/releases/$release_id
gateway=/opt/icao/runtime/gateway
backup=/opt/icao/backups/android-download-$backup_id
next_caddy=/tmp/icao-Caddyfile-$backup_id
next_compose=/tmp/icao-gateway-compose-$backup_id.yml

actual_sha=$(sha256sum "$incoming/$apk_name" | awk '{print $1}')
if [ "$actual_sha" != "$expected_sha" ]; then
  echo 'Uploaded APK checksum mismatch.' >&2
  exit 1
fi

mkdir -p "$backup" "$gateway" "$root/releases"
if [ -f "$gateway/Caddyfile" ]; then cp -p "$gateway/Caddyfile" "$backup/Caddyfile"; fi
if [ -f "$gateway/docker-compose.yml" ]; then cp -p "$gateway/docker-compose.yml" "$backup/docker-compose.yml"; fi

docker compose -f "$next_compose" config >/dev/null
docker run --rm -v "$next_caddy:/etc/caddy/Caddyfile:ro" caddy:2.11.4-alpine \
  caddy validate --config /etc/caddy/Caddyfile >/dev/null

gateway_changed=0
if [ ! -f "$gateway/Caddyfile" ] || ! cmp -s "$next_caddy" "$gateway/Caddyfile"; then gateway_changed=1; fi
if [ ! -f "$gateway/docker-compose.yml" ] || ! cmp -s "$next_compose" "$gateway/docker-compose.yml"; then gateway_changed=1; fi
install -m 644 "$next_caddy" "$gateway/Caddyfile"
install -m 644 "$next_compose" "$gateway/docker-compose.yml"
gateway_failed=0
if [ "$gateway_changed" -eq 1 ]; then
  docker compose -f "$gateway/docker-compose.yml" up -d --force-recreate || gateway_failed=1
else
  docker compose -f "$gateway/docker-compose.yml" up -d || gateway_failed=1
fi
if [ "$gateway_failed" -eq 1 ]; then
  if [ -f "$backup/Caddyfile" ]; then install -m 644 "$backup/Caddyfile" "$gateway/Caddyfile"; fi
  if [ -f "$backup/docker-compose.yml" ]; then install -m 644 "$backup/docker-compose.yml" "$gateway/docker-compose.yml"; fi
  docker compose -f "$gateway/docker-compose.yml" up -d --force-recreate
  exit 1
fi

rm -rf "$release"
mkdir -p "$release"
install -m 644 "$incoming/$apk_name" "$release/$apk_name"
install -m 644 "$incoming/version.json" "$release/version.json"
install -m 644 "$incoming/index.html" "$root/index.html.next"
install -m 644 "$incoming/styles.css" "$root/styles.css.next"
install -m 644 "$incoming/release.js" "$root/release.js.next"
mv -f "$root/index.html.next" "$root/index.html"
mv -f "$root/styles.css.next" "$root/styles.css"
mv -f "$root/release.js.next" "$root/release.js"
ln -sfn "releases/$release_id/$apk_name" "$root/latest.apk.next"
mv -Tf "$root/latest.apk.next" "$root/latest.apk"
ln -sfn "releases/$release_id/version.json" "$root/version.json.next"
mv -Tf "$root/version.json.next" "$root/version.json"
rm -rf "$incoming"

test "$(sha256sum "$root/latest.apk" | awk '{print $1}')" = "$expected_sha"
curl -fsS http://127.0.0.1:3101/health/ready >/dev/null
REMOTE

echo 'Waiting for the download HTTPS endpoint...'
ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- "$APK_SHA256" <<'REMOTE_VERIFY'
set -eu
expected_sha=$1
download_host=download.feizhuicao.com
resolve="${download_host}:443:127.0.0.1"

attempt=0
until curl -fsS --resolve "$resolve" --max-time 15 \
  "https://$download_host/version.json" >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo 'The download HTTPS endpoint did not become ready.' >&2
    exit 1
  fi
  sleep 2
done

page_headers=$(mktemp)
apk_headers=$(mktemp)
page_body=$(mktemp)
trap 'rm -f "$page_headers" "$apk_headers" "$page_body"' EXIT HUP INT TERM
curl -fsS --resolve "$resolve" -D "$page_headers" -o "$page_body" "https://$download_host/"
grep -qi '^x-robots-tag:.*noindex' "$page_headers"
grep -qi 'name="robots" content="noindex, nofollow, noarchive"' "$page_body"
curl -fsSI --resolve "$resolve" -D "$apk_headers" -o /dev/null "https://$download_host/latest.apk"
grep -qi '^content-type: application/vnd.android.package-archive' "$apk_headers"
downloaded_sha=$(curl -fsS --resolve "$resolve" "https://$download_host/latest.apk" | sha256sum | awk '{print $1}')
if [ "$downloaded_sha" != "$expected_sha" ]; then
  echo 'Public latest.apk checksum mismatch.' >&2
  exit 1
fi
curl -fsS http://127.0.0.1:3101/health/ready >/dev/null
REMOTE_VERIFY

echo "Published: https://download.feizhuicao.com/"
echo "Latest APK: https://download.feizhuicao.com/latest.apk"
echo "SHA-256: $APK_SHA256"
