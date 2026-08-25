import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

const rehearsalSource = await readFile(
  new URL('../scripts/rehearse-production-migrations.sh', import.meta.url),
  'utf8',
);
const startMarker = '# BEGIN migration-rehearsal-image-cleanup';
const endMarker = '# END migration-rehearsal-image-cleanup';
const start = rehearsalSource.indexOf(startMarker);
const end = rehearsalSource.indexOf(endMarker);
assert.ok(start >= 0 && end > start, 'migration rehearsal image cleanup markers are missing');
const cleanupFunction = rehearsalSource.slice(start + startMarker.length, end);

async function runScenario(scenario, imageExists) {
  const scratch = await mkdtemp(join(tmpdir(), 'icao-rehearsal-cleanup-test-'));
  const callLog = join(scratch, 'docker-calls.log');
  const harness = `
set -u
image=icao-api:migration-rehearsal-selftest
fake_image_exists=$FAKE_IMAGE_EXISTS
export fake_image_exists
docker() {
  printf '%s\\n' "$*" >> "$FAKE_CALL_LOG"
  test "$1" = image || return 90
  case "$2" in
    ls)
      if [ "$FAKE_SCENARIO" = inventory-error ]; then return 71; fi
      if [ "$fake_image_exists" = 1 ]; then printf '%s\\n' "$image"; fi
      ;;
    inspect)
      if [ "$FAKE_SCENARIO" = inspect-error ]; then return 72; fi
      test "$fake_image_exists" = 1
      ;;
    rm)
      if [ "$FAKE_SCENARIO" = delete-error ]; then return 73; fi
      test "$fake_image_exists" = 1 || return 74
      if [ "$FAKE_SCENARIO" = delete-noop ]; then return 0; fi
      fake_image_exists=0
      export fake_image_exists
      ;;
    *) return 91 ;;
  esac
}
${cleanupFunction}
cleanup_verified=0
if cleanup_rehearsal_image; then
  cleanup_verified=1
fi
if [ "$cleanup_verified" = 1 ]; then
  printf 'production_migration_rehearsal_ok\\n'
else
  printf 'cleanup_rejected\\n'
fi
`;
  try {
    const result = spawnSync('sh', ['-c', harness], {
      encoding: 'utf8',
      env: {
        ...process.env,
        FAKE_CALL_LOG: callLog,
        FAKE_IMAGE_EXISTS: imageExists ? '1' : '0',
        FAKE_SCENARIO: scenario,
      },
    });
    const calls = await readFile(callLog, 'utf8');
    return { ...result, calls };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

test('fails closed and cannot emit success when inspect fails for a listed image', async () => {
  const result = await runScenario('inspect-error', true);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.calls, /image ls/u);
  assert.match(result.calls, /image inspect/u);
  assert.doesNotMatch(result.calls, /image rm/u);
  assert.match(result.stdout, /cleanup_rejected/u);
  assert.doesNotMatch(result.stdout, /production_migration_rehearsal_ok/u);
  assert.match(result.stderr, /could not inspect the existing isolated rehearsal image/u);
});

test('fails closed and cannot emit success when image deletion fails', async () => {
  const result = await runScenario('delete-error', true);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.calls, /image inspect/u);
  assert.match(result.calls, /image rm/u);
  assert.match(result.stdout, /cleanup_rejected/u);
  assert.doesNotMatch(result.stdout, /production_migration_rehearsal_ok/u);
  assert.match(result.stderr, /could not remove the isolated rehearsal image/u);
});

test('deletes and verifies an existing exact image before allowing success', async () => {
  const result = await runScenario('success', true);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.match(/image ls/gu)?.length, 2);
  assert.match(result.calls, /image inspect/u);
  assert.match(result.calls, /image rm/u);
  assert.match(result.stdout, /production_migration_rehearsal_ok/u);
});

test('accepts an exact inventory result that proves the image is absent', async () => {
  const result = await runScenario('success', false);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.match(/image ls/gu)?.length, 1);
  assert.doesNotMatch(result.calls, /image inspect|image rm/u);
  assert.match(result.stdout, /production_migration_rehearsal_ok/u);
});

test('rejects success when image deletion returns zero but the exact tag remains', async () => {
  const result = await runScenario('delete-noop', true);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.match(/image ls/gu)?.length, 2);
  assert.match(result.stdout, /cleanup_rejected/u);
  assert.doesNotMatch(result.stdout, /production_migration_rehearsal_ok/u);
  assert.match(result.stderr, /isolated rehearsal image still exists after cleanup/u);
});

test('fails closed when the exact image inventory cannot be queried', async () => {
  const result = await runScenario('inventory-error', false);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /cleanup_rejected/u);
  assert.doesNotMatch(result.stdout, /production_migration_rehearsal_ok/u);
  assert.match(result.stderr, /could not list the isolated rehearsal image/u);
});
