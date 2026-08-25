import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertProductionMigrationConfirmation,
  parseRehearsalSuccess,
  productionMigrationConfirmation,
  validatePlanTransition,
} from './production-migration-apply-lib.mjs';

const sourceSha = 'a'.repeat(40);
const prePlan = '15:18:0';
const postPlan = '33:0:0';
const backupName = 'icao-20260825T165825Z-1151356.dump';
const evidencePath = '/opt/icao/runtime/migration-rehearsals/evidence/rehearsal-aaaaaaaaaaaa-20260825T170000Z.txt';
const successLine = `production_migration_rehearsal_ok source=${sourceSha} backup=${backupName} pre=${prePlan} post=${postPlan} evidence=${evidencePath}`;

test('binds the destructive confirmation to the full immutable source and exact plan', () => {
  const expected = `APPLY_PRODUCTION_MIGRATIONS:${sourceSha}:${prePlan}:${postPlan}`;
  assert.equal(productionMigrationConfirmation({ sourceSha, prePlan, postPlan }), expected);
  assert.equal(assertProductionMigrationConfirmation({
    confirmation: expected,
    sourceSha,
    prePlan,
    postPlan,
  }), expected);
  assert.throws(() => assertProductionMigrationConfirmation({
    confirmation: expected.replace('15:18:0', '15:17:0'),
    sourceSha,
    prePlan,
    postPlan,
  }), /production_confirmation_mismatch/u);
});

test('rejects unsafe or inconsistent expected plans', () => {
  for (const plans of [
    ['15:18:1', '33:0:0'],
    ['15:0:0', '15:0:0'],
    ['15:18:0', '32:0:0'],
    ['15:18:0', '33:1:0'],
    ['015:18:0', '33:0:0'],
  ]) {
    assert.throws(() => validatePlanTransition(...plans));
  }
});

test('accepts exactly one matching rehearsal completion line', () => {
  assert.deepEqual(parseRehearsalSuccess(`build output\n${successLine}\n`, {
    sourceSha,
    prePlan,
    postPlan,
  }), { backupName, evidencePath });
});

test('rejects stale, duplicated, mismatched, or path-injected rehearsal evidence', () => {
  const invalidLines = [
    `${successLine}\n${successLine}`,
    successLine.replace(sourceSha, 'b'.repeat(40)),
    successLine.replace(prePlan, '14:19:0'),
    successLine.replace(postPlan, '32:1:0'),
    successLine.replace(backupName, '../../postgres.dump'),
    successLine.replace(evidencePath, '/tmp/rehearsal.txt'),
  ];
  for (const line of invalidLines) {
    assert.throws(() => parseRehearsalSuccess(line, { sourceSha, prePlan, postPlan }));
  }
});

test('production migrator rejects missing wrapper authorization before any connection attempt', () => {
  const migratePath = new URL('../services/api/scripts/migrate.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [migratePath.pathname, '--production-apply'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://postgres:unused@127.0.0.1:1/postgres',
      ICAO_PRODUCTION_MIGRATION_SOURCE_SHA: sourceSha,
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production_migration_wrapper_authorization_missing/u);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|connection/u);
});

test('remote path guard rejects symlinks and abnormal mode while accepting a protected file', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const start = source.indexOf('# BEGIN production-migration-path-guard');
  const end = source.indexOf('# END production-migration-path-guard');
  assert.ok(start >= 0 && end > start);
  const guard = source.slice(start, end);
  const root = await mkdtemp(join(tmpdir(), 'icao-production-migration-guard-'));
  try {
    const file = join(root, 'protected');
    const link = join(root, 'protected-link');
    const fakeBin = join(root, 'bin');
    await writeFile(file, 'evidence', { mode: 0o600 });
    await symlink(file, link);
    await mkdir(fakeBin);
    await writeFile(join(fakeBin, 'stat'), '#!/bin/sh\nprintf "%s\\n" "${MOCK_STAT_RESULT:?}"\n');
    await chmod(join(fakeBin, 'stat'), 0o700);
    const run = (target, identity, kind = 'file') => spawnSync('/bin/sh', ['-c', `
set -eu
${guard}
require_root_owned_path "$PATH_KIND" "$PROTECTED_TARGET" 600
`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        MOCK_STAT_RESULT: identity,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        PATH_KIND: kind,
        PROTECTED_TARGET: target,
      },
    });
    assert.equal(run(file, '0:600').status, 0);
    assert.notEqual(run(file, '0:644').status, 0);
    assert.notEqual(run(file, '1000:600').status, 0);
    assert.notEqual(run(link, '0:600').status, 0);
    assert.notEqual(run(file, '0:600', 'directory').status, 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('remote lock guard creates only a regular root-owned lock and rejects symlinks', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const start = source.indexOf('# BEGIN production-migration-path-guard');
  const endMarker = '# END production-migration-lock-guard';
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start);
  const guards = source.slice(start, end + endMarker.length);
  const root = await mkdtemp(join(tmpdir(), 'icao-production-migration-lock-'));
  try {
    const lock = join(root, 'apply.lock');
    const target = join(root, 'target');
    const link = join(root, 'apply-link.lock');
    const fakeBin = join(root, 'bin');
    await writeFile(target, 'target');
    await symlink(target, link);
    await mkdir(fakeBin);
    await writeFile(join(fakeBin, 'stat'), `#!/bin/sh
case "$2" in
  %u) printf '%s\\n' "\${MOCK_STAT_UID:?}" ;;
  *) printf '%s\\n' "\${MOCK_STAT_IDENTITY:?}" ;;
esac
`);
    await chmod(join(fakeBin, 'stat'), 0o700);
    const run = (targetPath, uid = '0') => spawnSync('/bin/sh', ['-c', `
set -eu
${guards}
prepare_lock_file "$LOCK_TARGET"
`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        LOCK_TARGET: targetPath,
        MOCK_STAT_IDENTITY: '0:600',
        MOCK_STAT_UID: uid,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      },
    });
    assert.equal(run(lock).status, 0);
    assert.notEqual(run(link).status, 0);
    assert.notEqual(run(target, '1000').status, 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
