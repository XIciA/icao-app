#!/bin/sh
set -eu
umask 077
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_ROOT"
# Fetch before checking: a stale tracking ref is not release authority.
git fetch --no-tags origin develop
node tools/check-release-source.mjs testing
source_sha=$(git rev-parse HEAD)
case "$source_sha" in *[!a-f0-9]*|'') exit 1 ;; esac
test "${#source_sha}" -eq 40
archive_dir=$PROJECT_ROOT/.generated/testing-release/$source_sha
mkdir -p "$archive_dir"
git archive --format=tar "$source_sha" package.json pnpm-lock.yaml pnpm-workspace.yaml patches \
  modules/icao-distribution-environment modules/icao-wechat-auth packages/contracts services/api \
  content/vocabulary content/word-lookup/dataset.json content/app-content/text.json \
  content/question-banks/opi-hotspots.json infra/api infra/testing \
  tools/release-environment.mjs config/release/environments.json | gzip -n > "$archive_dir/source.tar.gz"
archive_sha=$(shasum -a 256 "$archive_dir/source.tar.gz" | awk '{print $1}')
ssh_key=${ICAO_ECS_SSH_KEY:-${HOME:?}/.ssh/icao_app_codex}
# Fixed project target; the remote deployer can mutate only the testing project.
remote=root@47.108.90.19
ssh -i "$ssh_key" -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 "$remote" \
  "test -f /opt/icao/testing/restore-complete.json && install -d -m 700 /opt/icao/testing/releases/$source_sha"
scp -q -i "$ssh_key" -o BatchMode=yes -o ConnectTimeout=15 "$archive_dir/source.tar.gz" "$remote:/opt/icao/testing/releases/$source_sha/source.tar.gz"
scp -q -i "$ssh_key" -o BatchMode=yes -o ConnectTimeout=15 infra/testing/deploy.py "$remote:/opt/icao/testing/releases/$source_sha/deploy.py"
ssh -i "$ssh_key" -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 "$remote" \
  "systemd-run --unit=icao-testing-deploy-$source_sha --wait --pipe --property=Nice=10 /usr/bin/python3 /opt/icao/testing/releases/$source_sha/deploy.py $source_sha $archive_sha"
