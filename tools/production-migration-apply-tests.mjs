import './migration-preservation-tests.mjs';
import './production-migration-recovery-tests.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertProductionMigrationConfirmation,
  deriveJournalBoundPostPlan,
  parseRehearsalSuccess,
  productionMigrationConfirmation,
  summarizeNonAuthoritativeRowCounts,
  validatePlanTransition,
} from './production-migration-apply-lib.mjs';
import {
  PUBLIC_TABLE_ACCESS_CLASSIFICATION,
  SERVER_ONLY_PUBLIC_TABLES,
} from '../services/api/scripts/production-schema-contract-data.mjs';

const sourceSha = 'a'.repeat(40);
const prePlan = '35:7:0';
const postPlan = '42:0:0';
const backupName = 'icao-20260825T165825Z-1151356.dump';
const evidencePath = '/opt/icao/runtime/migration-rehearsals/evidence/rehearsal-aaaaaaaaaaaa-20260825T170000Z.txt';
const successLine = `production_migration_rehearsal_ok source=${sourceSha} backup=${backupName} pre=${prePlan} post=${postPlan} evidence=${evidencePath}`;
const trustedPythonClearedEnvironment = [
  'LD_AUDIT',
  'GLIBC_TUNABLES',
  'LD_ASSUME_KERNEL',
  'LD_BIND_NOW',
  'LD_BIND_NOT',
  'LD_DEBUG',
  'LD_DEBUG_OUTPUT',
  'LD_DYNAMIC_WEAK',
  'LD_HWCAP_MASK',
  'LD_LIBRARY_PATH',
  'LD_ORIGIN_PATH',
  'LD_POINTER_GUARD',
  'LD_PREFER_MAP_32BIT_EXEC',
  'LD_PRELOAD',
  'LD_PROFILE',
  'LD_PROFILE_OUTPUT',
  'LD_SHOW_AUXV',
  'LD_TRACE_LOADED_OBJECTS',
  'LD_USE_LOAD_BIAS',
  'LD_VERBOSE',
  'LD_WARN',
  'PYTHONBREAKPOINT',
  'PYTHONCOERCECLOCALE',
  'PYTHONDONTWRITEBYTECODE',
  'PYTHONHASHSEED',
  'PYTHONHOME',
  'PYTHONINSPECT',
  'PYTHONIOENCODING',
  'PYTHONNOUSERSITE',
  'PYTHONPATH',
  'PYTHONPLATLIBDIR',
  'PYTHONSAFEPATH',
  'PYTHONSTARTUP',
  'PYTHONUSERBASE',
  'PYTHONUTF8',
  'PYTHONWARNINGS',
];
const trustedPythonTestSentinel = (name) => `ICAO_TEST_TRUSTED_ENV_${name}`;
const trustedPythonTestShellEnvironment = trustedPythonClearedEnvironment
  .map((name) => `${trustedPythonTestSentinel(name)}=hostile\nexport ${trustedPythonTestSentinel(name)}`)
  .join('\n');
const trustedPythonShellAssertions = trustedPythonClearedEnvironment
  .map((name) => `[ -z "\${${trustedPythonTestSentinel(name)}:-}" ] || exit 86`)
  .join('\n');

const trustedPythonUnsetEntry = (productionName, replacementName = productionName) => {
  const index = trustedPythonClearedEnvironment.indexOf(productionName);
  assert.notEqual(index, -1, productionName);
  const suffix = index === trustedPythonClearedEnvironment.length - 1 ? '\n' : ' \\\n';
  return `    ${replacementName}${suffix}`;
};

const instrumentTrustedPythonRunner = (source) => {
  // Dynamic loaders may consume LD_* variables before a shell fixture can observe them.
  // Map every real clear to an inert test-only sentinel so mutation tests remain portable.
  let instrumented = source;
  for (const name of trustedPythonClearedEnvironment) {
    const productionEntry = trustedPythonUnsetEntry(name);
    if (!instrumented.includes(productionEntry)) continue;
    instrumented = instrumented.replace(
      productionEntry,
      trustedPythonUnsetEntry(name, trustedPythonTestSentinel(name)),
    );
  }
  return instrumented;
};

function assertRehearsalSchemaEvidenceBinding(source) {
  for (const contract of [
    'test "$(evidence_value schema_contract_verified)" = 1',
    'rehearsal_schema_contract_sha=$(evidence_value schema_contract_sha256)',
    'rehearsal schema contract SHA is invalid',
    'test "${#rehearsal_schema_contract_sha}" -eq 64',
    'rehearsal_schema_contract_sha256=$rehearsal_schema_contract_sha',
  ]) {
    assert.ok(source.includes(contract), `formal apply is missing rehearsal schema evidence: ${contract}`);
  }
}

test('formal apply binds the successful rehearsal client-grant verifier evidence', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  assert.doesNotThrow(() => assertRehearsalSchemaEvidenceBinding(source));
  assert.throws(
    () => assertRehearsalSchemaEvidenceBinding(source.replace(
      'test "$(evidence_value schema_contract_verified)" = 1',
      ':',
    )),
    /schema_contract_verified/u,
  );
  assert.throws(
    () => assertRehearsalSchemaEvidenceBinding(source.replace(
      'rehearsal_schema_contract_sha=$(evidence_value schema_contract_sha256)',
      'rehearsal_schema_contract_sha=unverified',
    )),
    /schema_contract_sha256/u,
  );
});

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
    confirmation: expected.replace(prePlan, '35:6:0'),
    sourceSha,
    prePlan,
    postPlan,
  }), /production_confirmation_mismatch/u);
});

test('rejects unsafe or inconsistent expected plans', () => {
  for (const plans of [
    ['34:1:1', '35:0:0'],
    ['34:0:0', '35:0:0'],
    ['34:1:0', '34:0:0'],
    ['34:1:0', '35:1:0'],
    ['034:1:0', '35:0:0'],
  ]) {
    assert.throws(() => validatePlanTransition(...plans));
  }
});

test('derives the target from the immutable journal and binds 0034 through 0041 exactly', () => {
  const journal = {
    dialect: 'postgresql',
    entries: Array.from({ length: 42 }, (_, idx) => ({ idx, tag: `${idx}`, when: idx + 1 })),
  };
  assert.equal(deriveJournalBoundPostPlan('35:7:0', journal), '42:0:0');
  assert.equal(deriveJournalBoundPostPlan('39:3:0', journal), '42:0:0');
  assert.throws(() => deriveJournalBoundPostPlan('34:1:0', journal), /not_bound_to_journal/u);
  assert.throws(() => deriveJournalBoundPostPlan('42:0:0', journal), /requires_pending/u);
  assert.throws(() => deriveJournalBoundPostPlan('35:7:0', {
    ...journal,
    entries: journal.entries.map((entry) => ({ ...entry })).with(41, {
      ...journal.entries[41], idx: 40,
    }),
  }), /entry_invalid/u);
});

test('binds minimumSchemaVersion to the exact required 0056 journal entry', async () => {
  const [journalSource, migrationSource, databaseServiceSource] = await Promise.all([
    readFile(new URL('../services/api/drizzle/meta/_journal.json', import.meta.url), 'utf8'),
    readFile(new URL('../services/api/drizzle/0056_vocabulary_live_releases.sql', import.meta.url), 'utf8'),
    readFile(new URL('../services/api/src/database/database.service.ts', import.meta.url), 'utf8'),
  ]);
  const journal = JSON.parse(journalSource);
  const entry = journal.entries.at(-1);
  const hash = createHash('sha256').update(migrationSource).digest('hex');
  assert.equal(entry.idx, 56);
  assert.equal(entry.tag, '0056_vocabulary_live_releases');
  assert.equal(entry.when, 1793033035448);
  assert.ok(databaseServiceSource.includes(`MINIMUM_DATABASE_SCHEMA_VERSION = ${entry.idx}`));
  assert.ok(databaseServiceSource.includes('createdAt: 1793033035448'));
  assert.ok(databaseServiceSource.includes(`hash: '${hash}'`));
});

test('treats live row counts as non-authoritative across deletion and net-zero turnover', () => {
  assert.deepEqual(summarizeNonAuthoritativeRowCounts(100, 93, 'users'), {
    after: 93,
    before: 100,
    delta: -7,
    interpretation: 'non_authoritative_concurrent_activity_allowed',
  });
  assert.deepEqual(summarizeNonAuthoritativeRowCounts(100, 100, 'users'), {
    after: 100,
    before: 100,
    delta: 0,
    interpretation: 'non_authoritative_concurrent_activity_allowed',
  });
});

test('classifies every public Drizzle table as server-only with no unclassified additions', async () => {
  const schemaSource = await readFile(
    new URL('../services/api/src/database/schema.ts', import.meta.url),
    'utf8',
  );
  const schemaTables = [...schemaSource.matchAll(/pgTable\('([^']+)'/gu)]
    .map((match) => match[1])
    .sort();
  assert.equal(schemaTables.length, 68);
  assert.deepEqual(SERVER_ONLY_PUBLIC_TABLES, schemaTables);
  assert.deepEqual(
    Object.keys(PUBLIC_TABLE_ACCESS_CLASSIFICATION).sort(),
    schemaTables,
  );
  assert.ok(Object.values(PUBLIC_TABLE_ACCESS_CLASSIFICATION)
    .every((classification) => classification === 'server_only'));
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

test('remote prepare creates only exact upload paths and rejects malformed or escaped paths', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const start = source.indexOf('# BEGIN production-migration-remote-prepare');
  const endMarker = '# END production-migration-remote-prepare';
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start);
  const remotePrepare = source.slice(start, end + endMarker.length)
    .replace(
      'root=/opt/icao/runtime/production-migrations',
      'root=${TEST_REMOTE_ROOT:?}',
    );
  const testRoot = await mkdtemp(join(tmpdir(), 'icao-production-migration-prepare-'));
  const fakeBin = join(testRoot, 'bin');
  const protectedRoot = join(testRoot, 'protected');
  const sourceId = 'a'.repeat(12);
  const uploadToken = 'b'.repeat(32);
  const validUpload = join(
    protectedRoot,
    'uploads',
    `source-${sourceId}-${uploadToken}.tar.gz`,
  );
  const validChecksum = `${validUpload}.sha256`;
  try {
    await mkdir(fakeBin);
    await writeFile(join(fakeBin, 'stat'), '#!/bin/sh\nprintf "%s\\n" "0:700"\n');
    await chmod(join(fakeBin, 'stat'), 0o700);
    const run = (upload, checksum) => spawnSync('/bin/sh', ['-s', '--', upload, checksum], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        TEST_REMOTE_ROOT: protectedRoot,
      },
      input: `${remotePrepare}\n`,
    });

    const valid = run(validUpload, validChecksum);
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(valid.stdout, '');
    assert.equal(valid.stderr, '');
    await rm(validUpload, { force: true });
    await rm(validChecksum, { force: true });

    const invalidCases = [
      [
        join(protectedRoot, 'uploads', `source-${'a'.repeat(11)}-${uploadToken}.tar.gz`),
        validChecksum,
      ],
      [
        join(protectedRoot, 'uploads', `source-${sourceId}-${'b'.repeat(31)}.tar.gz`),
        validChecksum,
      ],
      [
        join(protectedRoot, 'uploads', `source-${'a'.repeat(11)}--${uploadToken}.tar.gz`),
        validChecksum,
      ],
      [
        join(protectedRoot, 'uploads', `source-${sourceId}-B${'b'.repeat(31)}.tar.gz`),
        validChecksum,
      ],
      [join(protectedRoot, 'uploads', 'nested', `source-${sourceId}-${uploadToken}.tar.gz`), validChecksum],
      [`${protectedRoot}/uploads/../source-${sourceId}-${uploadToken}.tar.gz`, validChecksum],
      [join(testRoot, `source-${sourceId}-${uploadToken}.tar.gz`), validChecksum],
      [validUpload, join(protectedRoot, 'uploads', 'nested', `${uploadToken}.sha256`)],
      [validUpload, join(testRoot, 'outside.sha256')],
      [validUpload, `${validChecksum}.extra`],
    ];
    for (const [upload, checksum] of invalidCases) {
      const invalid = run(upload, checksum);
      assert.notEqual(invalid.status, 0, `${upload}:${checksum}`);
      assert.equal(invalid.stdout, '');
      assert.notEqual(invalid.stderr, '');
    }
    assert.deepEqual(await readdir(join(protectedRoot, 'uploads')), []);
  } finally {
    await rm(testRoot, { force: true, recursive: true });
  }
});

test('--print-confirmation emits exactly one stdout line and no stderr', async () => {
  const fixturePath = await mkdtemp(join(tmpdir(), 'icao-production-migration-confirmation-'));
  const fixture = await realpath(fixturePath);
  try {
    for (const directory of ['scripts/lib', 'tools', 'services/api/drizzle/meta']) {
      await mkdir(join(fixture, directory), { recursive: true });
    }
    for (const relativePath of [
      'scripts/apply-production-migrations.sh',
      'scripts/lib/release-common.sh',
      'tools/check-mainline-release.mjs',
      'tools/production-migration-apply-contract.mjs',
      'tools/production-migration-apply-lib.mjs',
    ]) {
      await writeFile(
        join(fixture, relativePath),
        await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8'),
      );
    }
    await writeFile(join(fixture, 'services/api/drizzle/meta/_journal.json'), JSON.stringify({
      dialect: 'postgresql',
      entries: Array.from({ length: 42 }, (_, idx) => ({ idx, tag: `${idx}`, when: idx + 1 })),
    }));
    const git = (...args) => spawnSync('git', args, { cwd: fixture, encoding: 'utf8' });
    assert.equal(git('init', '-b', 'main').status, 0);
    assert.equal(git('add', 'scripts', 'tools', 'services').status, 0);
    assert.equal(git('-c', 'user.name=ICAO Test', '-c', 'user.email=icao-test@example.invalid',
      'commit', '-m', 'test fixture').status, 0);
    const fixtureSha = git('rev-parse', 'HEAD').stdout.trim();
    assert.match(fixtureSha, /^[a-f0-9]{40}$/u);
    assert.equal(git('update-ref', 'refs/remotes/origin/main', fixtureSha).status, 0);

    const result = spawnSync('/bin/sh', [join(fixture, 'scripts/apply-production-migrations.sh'),
      '--print-confirmation'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN: prePlan,
        ICAO_PRODUCTION_MIGRATION_SOURCE_ROOT: fixture,
      },
    });
    const expected = `APPLY_PRODUCTION_MIGRATIONS:${fixtureSha}:${prePlan}:${postPlan}\n`;
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, expected);
    assert.equal(result.stdout.split('\n').length, 2);
    assert.equal(result.stderr, '');
  } finally {
    await rm(fixturePath, { force: true, recursive: true });
  }
});

test('trusted host Python preflight rejects links, unsafe ownership, modes, and unusable executors', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const start = source.indexOf('# BEGIN production-migration-trusted-python-guard');
  const endMarker = '# END production-migration-trusted-python-guard';
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start);
  const guard = source.slice(start, end + endMarker.length);
  const root = await mkdtemp(join(tmpdir(), 'icao-production-trusted-python-'));
  try {
    const fakeBin = join(root, 'bin');
    const pythonPath = join(root, 'python3');
    const unusablePythonPath = join(root, 'python3-unusable');
    const pythonLink = join(root, 'python3-link');
    const missing = join(root, 'missing-python3');
    await mkdir(fakeBin);
    await writeFile(pythonPath, `#!/bin/sh
${trustedPythonShellAssertions}
[ "\${1:-}" = -I ]
[ "\${2:-}" = -c ]
exit 0
`);
    await writeFile(unusablePythonPath, `#!/bin/sh
${trustedPythonShellAssertions}
[ "\${1:-}" = -I ]
[ "\${2:-}" = -c ]
exit 91
`);
    await chmod(pythonPath, 0o755);
    await chmod(unusablePythonPath, 0o755);
    await symlink(pythonPath, pythonLink);
    await writeFile(join(fakeBin, 'stat'), `#!/bin/sh
[ "$#" -eq 4 ]
[ "$1" = -c ]
[ "$2" = '%u:%a' ]
[ "$3" = -- ]
[ "$4" = "$MOCK_STAT_TARGET" ]
printf '%s\n' "\${MOCK_STAT_IDENTITY:?}"
`);
    await chmod(join(fakeBin, 'stat'), 0o700);
    const run = (target, identity = '0:755', guardSource = guard) => spawnSync('/bin/sh', ['-c', `
set -eu
${trustedPythonTestShellEnvironment}
trusted_python="$TEST_TRUSTED_PYTHON"
${instrumentTrustedPythonRunner(guardSource)}
`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        MOCK_STAT_IDENTITY: identity,
        MOCK_STAT_TARGET: target,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        TEST_TRUSTED_PYTHON: target,
      },
    });

    const assertAccepted = (label, result) => assert.equal(
      result.status,
      0,
      `${label}: ${result.stderr}`,
    );
    const assertRejected = (label, result) => assert.notEqual(
      result.status,
      0,
      `${label}: stdout=${result.stdout} stderr=${result.stderr}`,
    );
    assertAccepted('root-owned-mode-755', run(pythonPath));
    assertAccepted('root-owned-mode-555', run(pythonPath, '0:555'));
    assertRejected('symlink', run(pythonLink));
    assertRejected('missing', run(missing));
    assertRejected('non-root-owner', run(pythonPath, '1000:755'));
    assertRejected('group-writable-mode', run(pythonPath, '0:775'));
    assertRejected('unusable-executor', run(unusablePythonPath));
    for (const variable of trustedPythonClearedEnvironment) {
      const productionEntry = trustedPythonUnsetEntry(variable);
      const mutated = guard.replace(
        productionEntry,
        trustedPythonUnsetEntry(variable, 'ICAO_TEST_REMOVED_UNSET_ENTRY'),
      );
      assert.notEqual(mutated, guard, variable);
      assert.equal(
        instrumentTrustedPythonRunner(mutated).includes(
          trustedPythonUnsetEntry(variable, trustedPythonTestSentinel(variable)),
        ),
        false,
        variable,
      );
      assertRejected(`${variable}-clear-removed`, run(pythonPath, '0:755', mutated));
    }
    await chmod(pythonPath, 0o644);
    assertRejected('not-executable', run(pythonPath));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('candidate image guard accepts one exact baked release identity and rejects every other shape', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const start = source.indexOf('# BEGIN production-migration-image-identity-guard');
  const endMarker = '# END production-migration-image-identity-guard';
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start);
  const guard = source.slice(start, end + endMarker.length);
  const runnerStart = source.indexOf('# BEGIN production-migration-trusted-python-runner');
  const runnerEndMarker = '# END production-migration-trusted-python-runner';
  const runnerEnd = source.indexOf(runnerEndMarker);
  assert.ok(runnerStart >= 0 && runnerEnd > runnerStart);
  const runner = source.slice(runnerStart, runnerEnd + runnerEndMarker.length);
  const root = await mkdtemp(join(tmpdir(), 'icao-production-image-identity-'));
  try {
    const fakeBin = join(root, 'bin');
    const workDir = join(root, 'work');
    const dockerCalls = join(root, 'docker-calls');
    const fakeHostPython = join(root, 'trusted-python');
    await mkdir(fakeBin);
    await mkdir(workDir);
    await writeFile(join(fakeBin, 'docker'), `#!/bin/sh
set -eu
printf '%s\n' "\${1:-missing}" >> "\${MOCK_DOCKER_CALLS:?}"
[ "\${1:-}" = inspect ] || { echo 'candidate image was asked to validate itself' >&2; exit 75; }
[ "\${2:-}" = --type ]
[ "\${3:-}" = image ]
if [ "\${MOCK_DOCKER_SCENARIO:-}" = inspect-fail ]; then exit 71; fi
printf '%s' "\${MOCK_IMAGE_ENV_JSON:-}"
`);
    await chmod(join(fakeBin, 'docker'), 0o700);
    const hostPython = spawnSync('/bin/sh', ['-c', 'command -v python3'], { encoding: 'utf8' })
      .stdout.trim();
    assert.notEqual(hostPython, '');
    await writeFile(fakeHostPython, `#!/bin/sh
${trustedPythonShellAssertions}
exec "\${REAL_HOST_PYTHON:?}" "$@"
`);
    await chmod(fakeHostPython, 0o700);
    const expectedReleaseId = `production-migration-${sourceSha.slice(0, 12)}`;
    const run = (imageEnvJson, scenario = 'success', runnerSource = runner) => spawnSync('/bin/sh', ['-c', `
set -eu
${trustedPythonTestShellEnvironment}
image=icao-api:production-migration-aaaaaaaaaaaa-bbbbbbbbbbbb
expected_image_release_id="$EXPECTED_RELEASE_ID"
work_dir="$TEST_WORK_DIR"
trusted_python="$TEST_FAKE_HOST_PYTHON"
${instrumentTrustedPythonRunner(runnerSource)}
${guard}
`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPECTED_RELEASE_ID: expectedReleaseId,
        MOCK_DOCKER_CALLS: dockerCalls,
        MOCK_DOCKER_SCENARIO: scenario,
        MOCK_IMAGE_ENV_JSON: imageEnvJson,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        REAL_HOST_PYTHON: hostPython,
        TEST_FAKE_HOST_PYTHON: fakeHostPython,
        TEST_WORK_DIR: workDir,
      },
    });

    const exact = `API_RELEASE_ID=${expectedReleaseId}`;
    assert.equal(run(JSON.stringify(['PATH=/usr/bin', exact, 'NODE_ENV=production'])).status, 0);
    const hostileNodeOptions = spawnSync('/bin/sh', ['-c', `
set -eu
${trustedPythonTestShellEnvironment}
image=icao-api:production-migration-aaaaaaaaaaaa-bbbbbbbbbbbb
expected_image_release_id="$EXPECTED_RELEASE_ID"
work_dir="$TEST_WORK_DIR"
trusted_python="$TEST_FAKE_HOST_PYTHON"
${instrumentTrustedPythonRunner(runner)}
${guard}
`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPECTED_RELEASE_ID: expectedReleaseId,
        MOCK_DOCKER_CALLS: dockerCalls,
        MOCK_DOCKER_SCENARIO: 'malicious-entrypoint-must-not-run',
        MOCK_IMAGE_ENV_JSON: JSON.stringify([
          exact,
          'NODE_OPTIONS=--import=data:text/javascript,throw%20new%20Error("should-not-run")',
        ]),
        NODE_OPTIONS: '--require=/definitely/missing/hostile-node-options.cjs',
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        REAL_HOST_PYTHON: hostPython,
        TEST_FAKE_HOST_PYTHON: fakeHostPython,
        TEST_WORK_DIR: workDir,
      },
    });
    assert.equal(hostileNodeOptions.status, 0, hostileNodeOptions.stderr);
    for (const variable of trustedPythonClearedEnvironment) {
      const mutatedRunner = runner.replace(
        trustedPythonUnsetEntry(variable),
        trustedPythonUnsetEntry(variable, 'ICAO_TEST_REMOVED_UNSET_ENTRY'),
      );
      assert.notEqual(mutatedRunner, runner, variable);
      assert.equal(
        instrumentTrustedPythonRunner(mutatedRunner).includes(
          trustedPythonUnsetEntry(variable, trustedPythonTestSentinel(variable)),
        ),
        false,
        variable,
      );
      assert.notEqual(run(JSON.stringify([exact]), 'success', mutatedRunner).status, 0, variable);
    }
    for (const [label, imageEnvJson, scenario] of [
      ['stale', JSON.stringify(['API_RELEASE_ID=release-old']), 'success'],
      ['missing', JSON.stringify(['NODE_ENV=production']), 'success'],
      ['duplicated', JSON.stringify([exact, exact]), 'success'],
      ['exact-plus-stale', JSON.stringify([exact, 'API_RELEASE_ID=release-old']), 'success'],
      ['embedded-lf', JSON.stringify([`${exact}\nAPI_RELEASE_ID=release-old`]), 'success'],
      ['embedded-cr', JSON.stringify([`${exact}\r`]), 'success'],
      ['trailing-space', JSON.stringify([`${exact} `]), 'success'],
      ['leading-space', JSON.stringify([` ${exact}`]), 'success'],
      ['near-key', JSON.stringify([`NOT_${exact}`]), 'success'],
      ['non-string', JSON.stringify([exact, 7]), 'success'],
      ['not-array', JSON.stringify({ env: [exact] }), 'success'],
      ['malformed-json', '[', 'success'],
      ['inspect-fail', JSON.stringify([exact]), 'inspect-fail'],
    ]) {
      const result = run(imageEnvJson, scenario);
      assert.notEqual(result.status, 0, label);
      assert.notEqual(result.stderr, '', label);
    }
    const calls = (await readFile(dockerCalls, 'utf8')).trim().split('\n');
    assert.ok(calls.length > 1);
    assert.ok(calls.every((call) => call === 'inspect'));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('Docker CLI argv model secures all seven candidate runs against baked env and entrypoint state', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const candidateNames = [
    'config-preflight',
    'target',
    'pre-plan',
    'apply',
    'post-current',
    'post-plan',
    'schema',
  ];
  const candidateCommands = candidateNames.map((name) => {
    const startMarker = `# BEGIN production-migration-candidate-run-${name}`;
    const endMarker = `# END production-migration-candidate-run-${name}`;
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker);
    assert.ok(start >= 0 && end > start, name);
    return { command: source.slice(start, end + endMarker.length), name };
  });
  const evidenceParserNames = ['pre-plan', 'post-plan', 'schema'];
  const evidenceParserCommands = evidenceParserNames.map((name) => {
    const startMarker = `# BEGIN production-migration-evidence-parser-${name}`;
    const endMarker = `# END production-migration-evidence-parser-${name}`;
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker);
    assert.ok(start >= 0 && end > start, name);
    return { command: source.slice(start, end + endMarker.length), name };
  });
  const root = await mkdtemp(join(tmpdir(), 'icao-production-runtime-identity-'));
  try {
    const fakeBin = join(root, 'bin');
    const runtimeEnv = join(root, 'runtime.env');
    await mkdir(fakeBin);
    await writeFile(runtimeEnv, [
      'API_RELEASE_ID=stale-production-release',
      'DATABASE_URL=postgresql://unused',
      'NODE_OPTIONS=--import=data:text/javascript,throw%20new%20Error("baked-node-options")',
      'NODE_PATH=/malicious/node/path',
      'LD_PRELOAD=/malicious/preload.so',
      'LD_LIBRARY_PATH=/malicious/library/path',
      '',
    ].join('\n'));
    await writeFile(join(fakeBin, 'docker'), `#!/bin/sh
set -eu
[ "\${1:-}" = run ]
shift
env_file_count=0
env_file_release_id=
env_file_node_options=
env_file_node_path=
env_file_ld_preload=
env_file_ld_library_path=
api_override_count=0
api_override_kind=
api_override_value=
node_options_override_count=0
node_options_override_kind=
node_options_override_value=
node_path_override_count=0
node_path_override_kind=
node_path_override_value=
ld_preload_override_count=0
ld_preload_override_kind=
ld_preload_override_value=
ld_library_path_override_count=0
ld_library_path_override_kind=
ld_library_path_override_value=
entrypoint_count=0
entrypoint_value=
record_override() {
  override=$1
  case "$override" in
    API_RELEASE_ID)
      api_override_count=$((api_override_count + 1)); api_override_kind=bare
      api_override_value=\${API_RELEASE_ID:-}
      ;;
    API_RELEASE_ID=*)
      api_override_count=$((api_override_count + 1)); api_override_kind=assignment
      api_override_value=\${override#API_RELEASE_ID=}
      ;;
    NODE_OPTIONS)
      node_options_override_count=$((node_options_override_count + 1)); node_options_override_kind=bare
      node_options_override_value=\${NODE_OPTIONS:-}
      ;;
    NODE_OPTIONS=*)
      node_options_override_count=$((node_options_override_count + 1)); node_options_override_kind=assignment
      node_options_override_value=\${override#NODE_OPTIONS=}
      ;;
    NODE_PATH)
      node_path_override_count=$((node_path_override_count + 1)); node_path_override_kind=bare
      node_path_override_value=\${NODE_PATH:-}
      ;;
    NODE_PATH=*)
      node_path_override_count=$((node_path_override_count + 1)); node_path_override_kind=assignment
      node_path_override_value=\${override#NODE_PATH=}
      ;;
    LD_PRELOAD)
      ld_preload_override_count=$((ld_preload_override_count + 1)); ld_preload_override_kind=bare
      ld_preload_override_value=\${LD_PRELOAD:-}
      ;;
    LD_PRELOAD=*)
      ld_preload_override_count=$((ld_preload_override_count + 1)); ld_preload_override_kind=assignment
      ld_preload_override_value=\${override#LD_PRELOAD=}
      ;;
    LD_LIBRARY_PATH)
      ld_library_path_override_count=$((ld_library_path_override_count + 1)); ld_library_path_override_kind=bare
      ld_library_path_override_value=\${LD_LIBRARY_PATH:-}
      ;;
    LD_LIBRARY_PATH=*)
      ld_library_path_override_count=$((ld_library_path_override_count + 1)); ld_library_path_override_kind=assignment
      ld_library_path_override_value=\${override#LD_LIBRARY_PATH=}
      ;;
  esac
}
load_env_file() {
  env_file=$1
  env_file_count=$((env_file_count + 1))
  env_file_release_id=$(awk -F= '$1 == "API_RELEASE_ID" { value = substr($0, length($1) + 2) } END { print value }' "$env_file")
  env_file_node_options=$(awk -F= '$1 == "NODE_OPTIONS" { value = substr($0, length($1) + 2) } END { print value }' "$env_file")
  env_file_node_path=$(awk -F= '$1 == "NODE_PATH" { value = substr($0, length($1) + 2) } END { print value }' "$env_file")
  env_file_ld_preload=$(awk -F= '$1 == "LD_PRELOAD" { value = substr($0, length($1) + 2) } END { print value }' "$env_file")
  env_file_ld_library_path=$(awk -F= '$1 == "LD_LIBRARY_PATH" { value = substr($0, length($1) + 2) } END { print value }' "$env_file")
}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --rm) shift ;;
    --network) shift 2 ;;
    -v) shift 2 ;;
    --env-file) load_env_file "$2"; shift 2 ;;
    --env-file=*) load_env_file "\${1#--env-file=}"; shift ;;
    -e|--env) record_override "$2"; shift 2 ;;
    --env=*) record_override "\${1#--env=}"; shift ;;
    -e?*) record_override "\${1#-e}"; shift ;;
    --entrypoint)
      entrypoint_count=$((entrypoint_count + 1)); entrypoint_value=$2; shift 2
      ;;
    --entrypoint=*)
      entrypoint_count=$((entrypoint_count + 1)); entrypoint_value=\${1#--entrypoint=}; shift
      ;;
    icao-api:*) image_value=$1; shift; break ;;
    *) exit 72 ;;
  esac
done
case "\${EXPECT_RUNTIME_BINDING:?}" in
  1)
    [ "$env_file_count" -eq 1 ] || { echo 'mock candidate env-file contract invalid' >&2; exit 73; }
    [ "$api_override_count" -eq 1 ] && [ "$api_override_kind" = assignment ] \
      || { echo 'mock candidate API identity override invalid' >&2; exit 73; }
    ;;
  0)
    [ "$env_file_count" -eq 0 ] && [ "$api_override_count" -eq 0 ] \
      || { echo 'mock evidence parser runtime binding must be absent' >&2; exit 73; }
    ;;
  *) exit 73 ;;
esac
[ "$node_options_override_count" -eq 1 ] && [ "$node_options_override_kind" = assignment ] \
  || { echo 'mock candidate NODE_OPTIONS override invalid' >&2; exit 73; }
[ "$node_path_override_count" -eq 1 ] && [ "$node_path_override_kind" = assignment ] \
  || { echo 'mock candidate NODE_PATH override invalid' >&2; exit 73; }
[ "$ld_preload_override_count" -eq 1 ] && [ "$ld_preload_override_kind" = assignment ] \
  || { echo 'mock candidate LD_PRELOAD override invalid' >&2; exit 73; }
[ "$ld_library_path_override_count" -eq 1 ] && [ "$ld_library_path_override_kind" = assignment ] \
  || { echo 'mock candidate LD_LIBRARY_PATH override invalid' >&2; exit 73; }
[ "$entrypoint_count" -eq 1 ] && [ "$entrypoint_value" = /usr/local/bin/node ] \
  || { echo 'mock candidate entrypoint override invalid' >&2; exit 73; }
# Docker applies explicit --env/-e and --entrypoint overrides after image and
# env-file defaults, independent of option ordering in the CLI argv.
release_id=$env_file_release_id
node_options=$env_file_node_options
node_path=$env_file_node_path
ld_preload=$env_file_ld_preload
ld_library_path=$env_file_ld_library_path
entrypoint=\${MOCK_IMAGE_ENTRYPOINT:-/malicious-entrypoint}
if [ "$EXPECT_RUNTIME_BINDING" = 1 ]; then release_id=$api_override_value; fi
node_options=$node_options_override_value
node_path=$node_path_override_value
ld_preload=$ld_preload_override_value
ld_library_path=$ld_library_path_override_value
entrypoint=$entrypoint_value
[ "$EXPECT_RUNTIME_BINDING" = 0 ] || [ "$release_id" = "\${EXPECTED_RELEASE_ID:?}" ]
[ -z "$node_options" ] && [ -z "$node_path" ] \
  && [ -z "$ld_preload" ] && [ -z "$ld_library_path" ] \
  && [ "$entrypoint" = /usr/local/bin/node ] \
  && [ "\${image_value:-}" = "\${EXPECTED_IMAGE:?}" ] \
  || { echo 'mock candidate final runtime state invalid' >&2; exit 73; }
`);
    await chmod(join(fakeBin, 'docker'), 0o700);
    const expectedReleaseId = `production-migration-${sourceSha.slice(0, 12)}`;
    const expectedImage = 'icao-api:production-migration-aaaaaaaaaaaa-bbbbbbbbbbbb';
    const run = (command, expectRuntimeBinding = true) => spawnSync('/bin/sh', ['-c', `
set -eu
runtime_env="$TEST_RUNTIME_ENV"
candidate_runtime_env="$TEST_RUNTIME_ENV"
expected_image_release_id="$EXPECTED_RELEASE_ID"
image="$EXPECTED_IMAGE"
source_sha=${sourceSha}
payload_source_sha=${sourceSha}
payload_tree_sha=not_applicable
rehearsal_reused=0
reused_evidence_sha=not_applicable
reuse_pre_plan_verified_at=not_applicable
reuse_state_proof=not_applicable
expected_pre_plan=${prePlan}
expected_post_plan=${postPlan}
confirmation="APPLY_PRODUCTION_MIGRATIONS:${sourceSha}:${prePlan}:${postPlan}"
pre_plan="$TEST_ROOT/pre-plan.json"
post_plan="$TEST_ROOT/post-plan.json"
schema_contract="$TEST_ROOT/schema-contract.json"
${command}
`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        API_RELEASE_ID: 'host-inherited-stale-identity',
        EXPECT_RUNTIME_BINDING: expectRuntimeBinding ? '1' : '0',
        EXPECTED_IMAGE: expectedImage,
        EXPECTED_RELEASE_ID: expectedReleaseId,
        NODE_OPTIONS: '',
        NODE_PATH: '/host/malicious/node/path',
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        TEST_ROOT: root,
        TEST_RUNTIME_ENV: runtimeEnv,
      },
    });
    const exactIdentityLine = '  -e "API_RELEASE_ID=$expected_image_release_id" \\\n';

    for (const { command, name } of candidateCommands) {
      const result = run(command);
      assert.equal(result.status, 0, `${name}: ${result.stderr}`);

      const crossLineDuplicate = command.replace(
        exactIdentityLine,
        `${exactIdentityLine}  -e \\\n    "API_RELEASE_ID=release-old" \\\n`,
      );
      assert.notEqual(crossLineDuplicate, command, name);
      assert.notEqual(run(crossLineDuplicate).status, 0, `${name}:cross-line`);
    }

    for (const { command, name } of evidenceParserCommands) {
      const result = run(command, false);
      assert.equal(result.status, 0, `${name}: ${result.stderr}`);
      const missingPreloadClear = command.replace(' -e LD_PRELOAD=', '');
      assert.notEqual(missingPreloadClear, command, name);
      assert.notEqual(run(missingPreloadClear, false).status, 0, `${name}:missing-preload-clear`);
    }

    const applyCommand = candidateCommands.find(({ name }) => name === 'apply').command;
    const overrideBeforeEnvFile = applyCommand.replace(
      '--env-file "$runtime_env" \\\n  -e "API_RELEASE_ID=$expected_image_release_id" \\',
      '-e "API_RELEASE_ID=$expected_image_release_id" \\\n  --env-file "$runtime_env" \\',
    );
    assert.notEqual(overrideBeforeEnvFile, applyCommand);
    assert.equal(run(overrideBeforeEnvFile).status, 0);

    for (const [label, from, to, failure] of [
      ['missing-api', exactIdentityLine, '', /API identity/u],
      ['quoted-option', exactIdentityLine,
        `${exactIdentityLine}  "-e" "API_RELEASE_ID=release-old" \\\n`, /API identity/u],
      ['bare-api', exactIdentityLine,
        `${exactIdentityLine}  -e API_RELEASE_ID \\\n`, /API identity/u],
      ['wrong-node-options', '  -e NODE_OPTIONS= \\\n',
        '  -e NODE_OPTIONS=--import=data:text/javascript,throw%20new%20Error \\\n', /final runtime/u],
      ['bare-node-options', '  -e NODE_OPTIONS= \\\n', '  -e NODE_OPTIONS \\\n', /NODE_OPTIONS/u],
      ['missing-ld-preload', '  -e LD_PRELOAD= \\\n', '', /LD_PRELOAD/u],
      ['bare-ld-library-path', '  -e LD_LIBRARY_PATH= \\\n',
        '  -e LD_LIBRARY_PATH \\\n', /LD_LIBRARY_PATH/u],
      ['missing-entrypoint', '  --entrypoint /usr/local/bin/node "$image" \\\n', '  "$image" \\\n', /entrypoint/u],
      ['wrong-entrypoint', '  --entrypoint /usr/local/bin/node "$image" \\\n',
        '  --entrypoint /malicious-entrypoint "$image" \\\n', /entrypoint/u],
    ]) {
      const adversarial = applyCommand.replace(from, to);
      assert.notEqual(adversarial, applyCommand, label);
      const result = run(adversarial);
      assert.notEqual(result.status, 0, label);
      assert.match(result.stderr, failure, label);
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('production migrator rejects a stale runtime identity before any database connection attempt', () => {
  const migratePath = new URL('../services/api/scripts/migrate.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [migratePath.pathname, '--production-apply'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      API_RELEASE_ID: 'stale-production-release',
      DATABASE_URL: 'postgresql://postgres:unused@127.0.0.1:1/postgres',
      ICAO_PRODUCTION_MIGRATION_APPLY: `apply:${sourceSha}:${prePlan}:${postPlan}`,
      ICAO_PRODUCTION_MIGRATION_CONFIRM: `APPLY_PRODUCTION_MIGRATIONS:${sourceSha}:${prePlan}:${postPlan}`,
      ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN: postPlan,
      ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN: prePlan,
      ICAO_PRODUCTION_MIGRATION_SOURCE_SHA: sourceSha,
      NODE_ENV: 'production',
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production_migration_image_identity_mismatch/u);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|connection/u);
});

test('production migrator rejects missing wrapper authorization before any connection attempt', () => {
  const migratePath = new URL('../services/api/scripts/migrate.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [migratePath.pathname, '--production-apply'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://postgres:unused@127.0.0.1:1/postgres',
      API_RELEASE_ID: `production-migration-${sourceSha.slice(0, 12)}`,
      ICAO_PRODUCTION_MIGRATION_CONFIRM: `APPLY_PRODUCTION_MIGRATIONS:${sourceSha}:${prePlan}:${postPlan}`,
      ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN: postPlan,
      ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN: prePlan,
      ICAO_PRODUCTION_MIGRATION_SOURCE_SHA: sourceSha,
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production_migration_wrapper_authorization_missing/u);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|connection/u);
});

test('production-like migrator invocations cannot omit or downgrade the guarded mode', () => {
  const migratePath = new URL('../services/api/scripts/migrate.mjs', import.meta.url);
  const run = (args, overrides = {}) => spawnSync(process.execPath, [migratePath.pathname, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      API_RELEASE_ID: `production-migration-${sourceSha.slice(0, 12)}`,
      DATABASE_URL: 'postgresql://postgres:unused@127.0.0.1:1/postgres',
      NODE_ENV: 'production',
      ...overrides,
    },
  });

  const missingMode = run([]);
  assert.notEqual(missingMode.status, 0);
  assert.match(missingMode.stderr, /migration_mode_required/u);
  assert.doesNotMatch(missingMode.stderr, /ECONNREFUSED|connection/u);

  const developmentMode = run(['--development-apply']);
  assert.notEqual(developmentMode.status, 0);
  assert.match(developmentMode.stderr, /development_migration_forbidden_in_production/u);
  assert.doesNotMatch(developmentMode.stderr, /ECONNREFUSED|connection/u);

  const productionWrongTarget = run(['--production-apply'], {
    ICAO_PRODUCTION_MIGRATION_APPLY: `apply:${sourceSha}:${prePlan}:${postPlan}`,
    ICAO_PRODUCTION_MIGRATION_CONFIRM: `APPLY_PRODUCTION_MIGRATIONS:${sourceSha}:${prePlan}:${postPlan}`,
    ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN: postPlan,
    ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN: prePlan,
    ICAO_PRODUCTION_MIGRATION_SOURCE_SHA: sourceSha,
  });
  assert.notEqual(productionWrongTarget.status, 0);
  assert.match(productionWrongTarget.stderr, /production_migration_database_target_invalid/u);
  assert.doesNotMatch(productionWrongTarget.stderr, /ECONNREFUSED|connection/u);
});

test('isolated rehearsal mode requires its exact source, image, database, and wrapper binding', () => {
  const migratePath = new URL('../services/api/scripts/migrate.mjs', import.meta.url);
  const databaseName = `icao_rehearsal_${sourceSha.slice(0, 12)}_${'b'.repeat(32)}`;
  const result = spawnSync(process.execPath, [migratePath.pathname, '--isolated-rehearsal'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      API_RELEASE_ID: `migration-rehearsal-${sourceSha.slice(0, 12)}`,
      DATABASE_URL: `postgresql://postgres:unused@db/${databaseName}`,
      ICAO_MIGRATION_REHEARSAL_DATABASE_NAME: databaseName,
      ICAO_PRODUCTION_MIGRATION_SOURCE_SHA: sourceSha,
      NODE_ENV: 'production',
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /migration_rehearsal_wrapper_authorization_missing/u);
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
    const run = (target, identity, kind = 'file', requiredMode = '600') => spawnSync('/bin/sh', ['-c', `
set -eu
${guard}
require_root_owned_path "$PATH_KIND" "$PROTECTED_TARGET" "$REQUIRED_MODE"
`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        MOCK_STAT_RESULT: identity,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        PATH_KIND: kind,
        PROTECTED_TARGET: target,
        REQUIRED_MODE: requiredMode,
      },
    });
    assert.equal(run(file, '0:600').status, 0);
    assert.notEqual(run(file, '0:644').status, 0);
    assert.notEqual(run(file, '1000:600').status, 0);
    assert.notEqual(run(link, '0:600').status, 0);
    assert.notEqual(run(file, '0:600', 'directory').status, 0);
    assert.equal(run(root, '0:700', 'directory', '700').status, 0);
    assert.notEqual(run(root, '0:755', 'directory', '700').status, 0);
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

test('production image cleanup propagates list, inspect, removal, and residual-image failures', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const start = source.indexOf('# BEGIN production-migration-image-cleanup');
  const endMarker = '# END production-migration-image-cleanup';
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start);
  const cleanup = source.slice(start, end + endMarker.length);
  const root = await mkdtemp(join(tmpdir(), 'icao-production-image-cleanup-'));
  try {
    const fakeBin = join(root, 'bin');
    const state = join(root, 'docker-state');
    await mkdir(fakeBin);
    await writeFile(join(fakeBin, 'docker'), `#!/bin/sh
case "\${1:-}:\${2:-}" in
  image:ls)
    [ "\${MOCK_DOCKER_SCENARIO:-}" = list-fail ] && exit 31
    if [ ! -e "\${MOCK_DOCKER_STATE:?}" ]; then
      : > "\${MOCK_DOCKER_STATE:?}"
      printf '%s\\n' "\${MOCK_IMAGE:?}"
    elif [ "\${MOCK_DOCKER_SCENARIO:-}" = residual ]; then
      printf '%s\\n' "\${MOCK_IMAGE:?}"
    fi
    ;;
  image:inspect) [ "\${MOCK_DOCKER_SCENARIO:-}" != inspect-fail ] ;;
  image:rm) [ "\${MOCK_DOCKER_SCENARIO:-}" != remove-fail ] ;;
  *) exit 32 ;;
esac
`);
    await chmod(join(fakeBin, 'docker'), 0o700);
    const run = async (scenario) => {
      await rm(state, { force: true });
      return spawnSync('/bin/sh', ['-c', `
set -eu
${cleanup}
image_created=1
image="$MOCK_IMAGE"
cleanup_migration_image
`], {
        encoding: 'utf8',
        env: {
          ...process.env,
          MOCK_DOCKER_SCENARIO: scenario,
          MOCK_DOCKER_STATE: state,
          MOCK_IMAGE: 'icao-api:production-migration-aaaaaaaaaaaa-bbbbbbbbbbbb',
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        },
      });
    };
    for (const scenario of ['list-fail', 'inspect-fail', 'remove-fail', 'residual']) {
      assert.notEqual((await run(scenario)).status, 0, scenario);
    }
    assert.equal((await run('success')).status, 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('evidence publication remains invisible until staging cleanup and validation complete', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const start = source.indexOf('# BEGIN production-migration-evidence-publication');
  const endMarker = '# END production-migration-evidence-publication';
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start);
  const publication = source.slice(start, end + endMarker.length);
  const root = await mkdtemp(join(tmpdir(), 'icao-production-evidence-'));
  try {
    const realChmod = spawnSync('/bin/sh', ['-c', 'command -v chmod'], { encoding: 'utf8' }).stdout.trim();
    const realMv = spawnSync('/bin/sh', ['-c', 'command -v mv'], { encoding: 'utf8' }).stdout.trim();
    const realRm = spawnSync('/bin/sh', ['-c', 'command -v rm'], { encoding: 'utf8' }).stdout.trim();
    const run = async (scenario) => {
      const caseRoot = join(root, scenario);
      const evidenceDir = join(caseRoot, 'evidence');
      const fakeBin = join(caseRoot, 'bin');
      await mkdir(evidenceDir, { recursive: true });
      await mkdir(fakeBin);
      await writeFile(join(fakeBin, 'chmod'), `#!/bin/sh
[ "\${MOCK_EVIDENCE_FAILURE:-}" = chmod ] && exit 41
exec "\${REAL_CHMOD:?}" "$@"
`);
      await writeFile(join(fakeBin, 'mv'), `#!/bin/sh
[ "\${MOCK_EVIDENCE_FAILURE:-}" = move ] && exit 42
exec "\${REAL_MV:?}" "$@"
`);
      await writeFile(join(fakeBin, 'rm'), `#!/bin/sh
[ "\${MOCK_EVIDENCE_FAILURE:-}" = remove-persistent ] && exit 43
exec "\${REAL_RM:?}" "$@"
`);
      await chmod(join(fakeBin, 'chmod'), 0o700);
      await chmod(join(fakeBin, 'mv'), 0o700);
      await chmod(join(fakeBin, 'rm'), 0o700);
      const result = spawnSync('/bin/sh', ['-c', `
set -eu
${publication}
require_root_owned_path() { [ "\${MOCK_EVIDENCE_FAILURE:-}" != guard ]; }
evidence_dir="$TEST_EVIDENCE_DIR"
source_id=aaaaaaaaaaaa
token_id=bbbbbbbbbbbb
stage=test
source_sha=${sourceSha}
payload_source_sha=${sourceSha}
payload_tree_sha=not_applicable
rehearsal_reused=0
reused_evidence_sha=not_applicable
reuse_pre_plan_verified_at=not_applicable
reuse_state_proof=not_applicable
archive_sha=${'c'.repeat(64)}
confirmation="APPLY_PRODUCTION_MIGRATIONS:${sourceSha}:${prePlan}:${postPlan}"
backup_name=${backupName}
backup_sha=${'d'.repeat(64)}
backup="/opt/icao/backups/postgres/${backupName}"
backup_root=/opt/icao/backups/postgres
cutover_backup_name=icao-20260904T010203Z-42.dump
cutover_backup_sha=${'9'.repeat(64)}
drain_completed_at=2026-09-04T01:02:02Z
cutover_backup_completed_at=2026-09-04T01:02:04Z
old_running_image=sha256:${'8'.repeat(64)}
old_running_release_id=previous-release
old_api_exit_state='143 false'
old_api_drain_started=1
old_api_drained=1
old_api_restart_verified=0
new_api_started=1
cutover_committed=1
roll_forward_only=0
failure_semantics=not_applicable
failure_origin_stage=unavailable
rehearsal_evidence="${evidencePath}"
expected_pre_plan=${prePlan}
expected_post_plan=${postPlan}
pre_summary=${prePlan}
post_summary=${postPlan}
migration_started=1
migration_completed=1
before_migrations=34
after_migrations=35
before_business_rows=100
after_business_rows=101
before_auth_users=10
after_auth_users=11
rehearsal_schema_contract_sha=${'f'.repeat(64)}
schema_contract_sha=${'e'.repeat(64)}
cleanup_verified=1
cleanup_in_progress=0
publish_evidence succeeded
`], {
        encoding: 'utf8',
        env: {
          ...process.env,
          MOCK_EVIDENCE_FAILURE: scenario,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          REAL_CHMOD: realChmod,
          REAL_MV: realMv,
          REAL_RM: realRm,
          TEST_EVIDENCE_DIR: evidenceDir,
        },
      });
      return { files: await readdir(evidenceDir), result };
    };

    for (const scenario of ['chmod', 'move', 'remove-persistent', 'guard']) {
      const { files, result } = await run(scenario);
      assert.notEqual(result.status, 0, scenario);
      assert.equal(
        files.some((file) => file.endsWith('-succeeded.txt')),
        false,
        `${scenario} must not leave published succeeded evidence`,
      );
      if (scenario === 'remove-persistent') {
        assert.match(result.stderr, /evidence staging cleanup failed/u);
      }
    }
    const successful = await run('success');
    assert.equal(successful.result.status, 0, successful.result.stderr);
    assert.equal(successful.files.length, 1);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('the candidate runtime environment is outside staged source and removed by cleanup', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const startMarker = '# BEGIN production-migration-remote-cleanup';
  const endMarker = '# END production-migration-remote-cleanup';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start);
  assert.ok(source.includes('candidate_runtime_root=/run/icao-production-migrations'));
  assert.equal(source.includes('candidate_runtime_env=$work_dir/'), false);
  const cleanup = source.slice(start, end + endMarker.length);
  const fixture = await mkdtemp(join(tmpdir(), 'icao-production-candidate-env-'));
  try {
    const root = join(fixture, 'runtime');
    const candidateRuntimeRoot = join(fixture, 'run');
    const runtimeApiDir = join(fixture, 'runtime-api');
    const runtimeEnvNext = join(runtimeApiDir, '.env.next-aaaaaaaaaaaa-bbbbbbbbbbbb');
    const runtimeComposeNext = join(runtimeApiDir, 'docker-compose.yml.next-aaaaaaaaaaaa-bbbbbbbbbbbb');
    const runtimeSource = join(fixture, 'source');
    const runtimeSourceNext = `${runtimeSource}.next`;
    const candidateRuntimeEnv = join(candidateRuntimeRoot, 'candidate-aaaaaaaaaaaa-bbbbbbbbbbbb.env');
    await mkdir(root);
    await mkdir(candidateRuntimeRoot);
    await mkdir(runtimeApiDir);
    await writeFile(candidateRuntimeEnv, 'SECRET=not-archived\n');
    await writeFile(runtimeEnvNext, 'SECRET=staged\n');
    await writeFile(runtimeComposeNext, 'services: {}\n');
    await mkdir(runtimeSourceNext);
    await writeFile(join(runtimeSourceNext, 'partial-generated-file'), 'remove me\n');
    const result = spawnSync('/bin/sh', ['-c', `
set -eu
${cleanup}
cleanup_migration_image() { :; }
root="$TEST_ROOT"
work_dir="$root/.work-test"
work_dir_created=0
upload="$root/upload.tar.gz"
checksum="$upload.sha256"
candidate_runtime_root="$TEST_CANDIDATE_ROOT"
candidate_runtime_env="$TEST_CANDIDATE_ENV"
candidate_runtime_env_created=1
runtime_api_dir="$TEST_RUNTIME_API_DIR"
runtime_env_next="$TEST_RUNTIME_ENV_NEXT"
runtime_env_next_created=1
runtime_compose_next="$TEST_RUNTIME_COMPOSE_NEXT"
runtime_compose_next_created=1
runtime_source="$TEST_RUNTIME_SOURCE"
runtime_source_next="$TEST_RUNTIME_SOURCE_NEXT"
runtime_source_next_created=1
trap cleanup_remote_resources EXIT
exit 47
`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TEST_CANDIDATE_ENV: candidateRuntimeEnv,
        TEST_CANDIDATE_ROOT: candidateRuntimeRoot,
        TEST_ROOT: root,
        TEST_RUNTIME_API_DIR: runtimeApiDir,
        TEST_RUNTIME_COMPOSE_NEXT: runtimeComposeNext,
        TEST_RUNTIME_ENV_NEXT: runtimeEnvNext,
        TEST_RUNTIME_SOURCE: runtimeSource,
        TEST_RUNTIME_SOURCE_NEXT: runtimeSourceNext,
      },
    });
    assert.equal(result.status, 47, result.stderr);
    await assert.rejects(readFile(candidateRuntimeEnv, 'utf8'), /ENOENT/u);
    await assert.rejects(readFile(runtimeEnvNext, 'utf8'), /ENOENT/u);
    await assert.rejects(readFile(runtimeComposeNext, 'utf8'), /ENOENT/u);
    await assert.rejects(readFile(runtimeSourceNext, 'utf8'), /ENOENT/u);
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test('the shared cutover lock fails closed under real lock contention', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const startMarker = '# BEGIN production-migration-cutover-locks';
  const endMarker = '# END production-migration-cutover-locks';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start);
  const root = await mkdtemp(join(tmpdir(), 'icao-production-cutover-lock-'));
  try {
    const fakeBin = join(root, 'bin');
    await mkdir(fakeBin);
    await writeFile(join(fakeBin, 'flock'), `#!/usr/bin/python3
import fcntl
import sys

fd = int(sys.argv[-1])
fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
`);
    await chmod(join(fakeBin, 'flock'), 0o700);
    const lockNames = [
      'icao-production-migration-apply.lock',
      'icao-production-migration-rehearsal.lock',
      'icao-postgres-backup.lock',
      'icao-production-release-change.lock',
    ];
    let block = source.slice(start + startMarker.length, end);
    for (const name of lockNames) {
      block = block.replaceAll(`/run/lock/${name}`, join(root, name));
    }
    const releaseLock = join(root, 'icao-production-release-change.lock');
    const result = spawnSync('/bin/sh', ['-c', `
set -eu
prepare_lock_file() { : > "$1"; }
exec 5<>"$RELEASE_LOCK"
flock -n 5
${block}
`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        RELEASE_LOCK: releaseLock,
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /production API or Ops release change is still running/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('cutover failure policy settles one stop window before restart and fails closed after migration starts', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const start = source.indexOf('# BEGIN production-migration-cutover-failure-policy');
  const endMarker = '# END production-migration-cutover-failure-policy';
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start);
  const policy = source.slice(start, end + endMarker.length);
  const root = await mkdtemp(join(tmpdir(), 'icao-production-cutover-policy-'));
  try {
    const fakeBin = join(root, 'bin');
    const stateFile = join(root, 'running-state');
    const callsFile = join(root, 'calls');
    const clockFile = join(root, 'clock');
    await mkdir(fakeBin);
    await writeFile(join(fakeBin, 'docker'), `#!/bin/sh
set -eu
printf '%s\n' "$*" >> "$MOCK_CALLS_FILE"
case "$1" in
  start)
    [ "\${MOCK_START_FAIL:-0}" != 1 ] || exit 71
    printf 'true\n' > "$MOCK_STATE_FILE"
    ;;
  stop)
    case "$2:$3" in --time:60|--time:30) ;; *) exit 70 ;; esac
    printf 'stop_begin_%s\n' "$3" >> "$MOCK_CALLS_FILE"
    if [ "\${MOCK_FULL_GRACE:-0}" = 1 ] && [ "$3" = 60 ]; then sleep 60; fi
    printf 'false\n' > "$MOCK_STATE_FILE"
    printf 'stop_settled_%s\n' "$3" >> "$MOCK_CALLS_FILE"
    ;;
  inspect)
    if [ "\${2:-}" = icao-api ]; then exit 0; fi
    [ "$2" = -f ]
    case "$3" in
      *Image*) printf '%s\n' "$MOCK_OBSERVED_IMAGE" ;;
      *Running*) cat "$MOCK_STATE_FILE" ;;
      *ExitCode*) printf '%s\n' "$MOCK_OBSERVED_EXIT_STATE" ;;
      *) exit 72 ;;
    esac
    ;;
  *) exit 73 ;;
esac
`);
    await writeFile(join(fakeBin, 'curl'), `#!/bin/sh
case "$*" in
  *'-D -'*) printf 'HTTP/1.1 200 OK\r\nX-ICAO-API-Version: %s\r\n\r\n' "$MOCK_OBSERVED_RELEASE" ;;
esac
exit 0
`);
    await writeFile(join(fakeBin, 'sleep'), `#!/bin/sh
set -eu
clock=$(cat "$MOCK_CLOCK_FILE")
printf '%s\n' "$((clock + $1))" > "$MOCK_CLOCK_FILE"
printf 'sleep_%s\n' "$1" >> "$MOCK_CALLS_FILE"
`);
    await chmod(join(fakeBin, 'docker'), 0o700);
    await chmod(join(fakeBin, 'curl'), 0o700);
    await chmod(join(fakeBin, 'sleep'), 0o700);
    const oldImage = `sha256:${'a'.repeat(64)}`;
    const run = (migrationStarted, {
      committed = 0,
      fullGrace = 0,
      initialState = migrationStarted === 1 ? 'true' : 'false',
      observedExitState = '0 false',
      observedImage = oldImage,
      observedRelease = 'old-release',
      startFail = 0,
    } = {}) => {
      spawnSync('/bin/sh', ['-c', `printf '${initialState}\\n' > "$MOCK_STATE_FILE"; printf '0\\n' > "$MOCK_CLOCK_FILE"; : > "$MOCK_CALLS_FILE"`], {
        env: {
          ...process.env,
          MOCK_CALLS_FILE: callsFile,
          MOCK_CLOCK_FILE: clockFile,
          MOCK_STATE_FILE: stateFile,
        },
      });
      return spawnSync('/bin/sh', ['-c', `
set -eu
${policy}
old_api_drained=1
old_api_drain_started=1
cutover_committed=${committed}
migration_started=${migrationStarted}
old_running_image="$MOCK_OLD_IMAGE"
old_running_release_id=old-release
old_api_restart_verified=0
old_api_exit_state=unavailable
roll_forward_only=0
failure_semantics=not_applicable
stage=test
enforce_cutover_failure_policy
printf 'restart=%s roll_forward=%s drained=%s state=%s\n' \
  "$old_api_restart_verified" "$roll_forward_only" "$old_api_drained" "$(cat "$MOCK_STATE_FILE")"
printf 'semantics=%s\n' "$failure_semantics"
printf 'exit_state=%s\n' "$old_api_exit_state"
`], {
        encoding: 'utf8',
        env: {
          ...process.env,
          MOCK_CALLS_FILE: callsFile,
          MOCK_CLOCK_FILE: clockFile,
          MOCK_FULL_GRACE: String(fullGrace),
          MOCK_OBSERVED_EXIT_STATE: observedExitState,
          MOCK_OBSERVED_IMAGE: observedImage,
          MOCK_OBSERVED_RELEASE: observedRelease,
          MOCK_OLD_IMAGE: oldImage,
          MOCK_START_FAIL: String(startFail),
          MOCK_STATE_FILE: stateFile,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        },
      });
    };

    const beforeMigration = run(0);
    assert.equal(beforeMigration.status, 0, beforeMigration.stderr);
    assert.match(beforeMigration.stdout, /restart=1 roll_forward=0 drained=0 state=true/u);
    assert.match(beforeMigration.stdout, /semantics=pre_migration_failure_old_api_restored/u);
    assert.match(beforeMigration.stdout, /exit_state=0 false/u);
    assert.match(await readFile(callsFile, 'utf8'), /^stop --time 60 icao-api[\s\S]*stop_settled_60[\s\S]*inspect -f .*Running.* icao-api[\s\S]*inspect -f .*ExitCode.* icao-api[\s\S]*start icao-api/mu);

    const fullGraceStop = run(0, { fullGrace: 1, initialState: 'true', observedExitState: '137 false' });
    assert.equal(fullGraceStop.status, 0, fullGraceStop.stderr);
    assert.match(fullGraceStop.stdout, /restart=1 roll_forward=0 drained=0 state=true/u);
    assert.match(fullGraceStop.stdout, /exit_state=137 false/u);
    assert.equal((await readFile(clockFile, 'utf8')).trim(), '60');
    assert.match(await readFile(callsFile, 'utf8'), /stop_begin_60[\s\S]*sleep_60[\s\S]*stop_settled_60[\s\S]*start icao-api/u);

    const imageMismatch = run(0, { observedImage: `sha256:${'b'.repeat(64)}` });
    assert.notEqual(imageMismatch.status, 0);
    assert.match(imageMismatch.stderr, /image does not match the drained image/u);

    const releaseMismatch = run(0, { observedRelease: 'wrong-release' });
    assert.notEqual(releaseMismatch.status, 0);
    assert.match(releaseMismatch.stderr, /release header does not match the drained release/u);

    const afterMigration = run(1);
    assert.equal(afterMigration.status, 0, afterMigration.stderr);
    assert.match(afterMigration.stdout, /restart=0 roll_forward=1 drained=1 state=false/u);
    assert.match(afterMigration.stdout, /semantics=post_migration_roll_forward_only_api_closed/u);
    assert.match(afterMigration.stderr, /old API remains closed/u);
    assert.equal((await readFile(callsFile, 'utf8')).includes('start icao-api'), false);

    const committed = run(1, { committed: 1 });
    assert.equal(committed.status, 0, committed.stderr);
    assert.match(committed.stdout, /semantics=post_cutover_housekeeping_failure_new_api_left_active/u);
    assert.equal(await readFile(callsFile, 'utf8'), '');

    const restartFailure = run(0, { startFail: 1 });
    assert.notEqual(restartFailure.status, 0);
    assert.match(restartFailure.stderr, /could not be restarted after reaching a stopped state/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('cleanup ignores a second termination signal and distinguishes post-commit failure', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const startMarker = '# BEGIN production-migration-cutover-cleanup-on-exit';
  const endMarker = '# END production-migration-cutover-cleanup-on-exit';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start);
  const cleanup = source.slice(start, end + endMarker.length);
  const root = await mkdtemp(join(tmpdir(), 'icao-production-cleanup-signal-'));
  try {
    const events = join(root, 'events');
    const run = (committed) => spawnSync('/bin/sh', ['-c', `
set -eu
${cleanup}
enforce_cutover_failure_policy() {
  printf 'cleanup_entered\n' >> "$TEST_EVENTS"
  kill -TERM "$$"
  printf 'cleanup_survived_second_signal\n' >> "$TEST_EVENTS"
  stage=policy_internal_stage
}
cleanup_remote_resources() {
  stage=remote_cleanup_internal_stage
  printf 'remote_cleanup_completed\n' >> "$TEST_EVENTS"
}
publish_evidence() {
  printf 'failure_origin_stage=%s\n' "$failure_origin_stage" >> "$TEST_EVENTS"
  printf 'failure_evidence_published\n' >> "$TEST_EVENTS"
  printf '/tmp/evidence\n'
}
stage=test
cleanup_verified=0
cutover_committed=${committed}
trap cleanup_on_exit EXIT
trap 'exit 1' HUP INT TERM
kill -TERM "$$"
`], {
      encoding: 'utf8',
      env: { ...process.env, TEST_EVENTS: events },
    });

    const preCommit = run(0);
    assert.notEqual(preCommit.status, 0);
    assert.match(await readFile(events, 'utf8'), /cleanup_survived_second_signal/u);

    await writeFile(events, '');
    const postCommit = run(1);
    assert.notEqual(postCommit.status, 0);
    assert.match(postCommit.stderr, /cutover committed; post-commit housekeeping failed/u);
    assert.doesNotMatch(postCommit.stderr, /failed closed/u);
    assert.deepEqual((await readFile(events, 'utf8')).trim().split('\n'), [
      'cleanup_entered',
      'cleanup_survived_second_signal',
      'remote_cleanup_completed',
      'failure_origin_stage=test',
      'failure_evidence_published',
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('drain waits for old in-flight work and the authoritative backup is created afterward', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const start = source.indexOf('# BEGIN production-migration-cutover-drain-and-backup');
  const endMarker = '# END production-migration-cutover-drain-and-backup';
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end + endMarker.length);
  const root = await mkdtemp(join(tmpdir(), 'icao-production-cutover-drain-'));
  try {
    const fakeBin = join(root, 'bin');
    const backupRoot = join(root, 'backups');
    const cutoverRecordDir = join(root, 'cutover-record');
    const runtimeEnv = join(root, 'runtime.env');
    const runtimeCompose = join(root, 'compose.yml');
    const backupTool = join(root, 'backup.sh');
    const stateFile = join(root, 'running-state');
    const orderFile = join(root, 'order');
    await mkdir(fakeBin);
    await mkdir(backupRoot);
    await writeFile(runtimeEnv, 'NODE_ENV=production\n');
    await writeFile(runtimeCompose, 'services: {}\n');
    await writeFile(stateFile, 'true\n');
    await writeFile(orderFile, '');
    await writeFile(join(fakeBin, 'docker'), `#!/bin/sh
set -eu
case "$1" in
  image)
    [ "$2" = inspect ]
    printf 'sha256:%064d\n' 0
    ;;
  inspect)
    [ "$2" = -f ]
    case "$3" in
      *Image*) printf 'sha256:%064d\n' 0 ;;
      *Health*) printf 'true healthy\n' ;;
      *Running*) cat "$MOCK_STATE_FILE" ;;
      *ExitCode*) printf '%s\n' "$MOCK_EXIT_STATE" ;;
      *) exit 81 ;;
    esac
    ;;
  exec) printf 'old-release\n' ;;
  stop)
    printf 'old_inflight_request_completed\n' >> "$MOCK_ORDER_FILE"
    printf 'false\n' > "$MOCK_STATE_FILE"
    ;;
  *) exit 82 ;;
esac
`);
    await writeFile(join(fakeBin, 'curl'), `#!/bin/sh
case "$*" in
  *'-D -'*) printf 'HTTP/1.1 200 OK\r\nX-ICAO-API-Version: old-release\r\n\r\n' ;;
esac
exit 0
`);
    await writeFile(backupTool, `#!/bin/sh
set -eu
test "$(cat "$MOCK_STATE_FILE")" = false
printf 'backup_started_after_drain\n' >> "$MOCK_ORDER_FILE"
target="$MOCK_BACKUP_ROOT/icao-20260904T010203Z-42.dump"
printf 'isolated fixture\n' > "$target"
if [ "\${MOCK_STALE_BACKUP:-0}" = 1 ]; then touch -t 200001010000 "$target"; fi
digest=$(sha256sum "$target" | awk '{ print $1 }')
printf '%s  %s\n' "$digest" "$(basename "$target")" > "$target.sha256"
chmod 600 "$target" "$target.sha256"
printf '%s\n' "$target"
`);
    await writeFile(join(fakeBin, 'stat'), `#!/bin/sh
set -eu
[ "$1" = -c ]
[ "$2" = %Y ]
if [ "\${MOCK_STALE_BACKUP:-0}" = 1 ]; then printf '1\n'; else date +%s; fi
`);
    await chmod(join(fakeBin, 'docker'), 0o700);
    await chmod(join(fakeBin, 'curl'), 0o700);
    await chmod(join(fakeBin, 'stat'), 0o700);
    await chmod(backupTool, 0o700);
    const run = ({ exitState = '143 false', stale = 0 } = {}) => spawnSync('/bin/sh', ['-c', `
set -eu
require_root_owned_path() { :; }
cutover_record_dir="$MOCK_CUTOVER_RECORD_DIR"
runtime_env="$MOCK_RUNTIME_ENV"
runtime_compose="$MOCK_RUNTIME_COMPOSE"
backup_tool="$MOCK_BACKUP_TOOL"
backup_root="$MOCK_BACKUP_ROOT"
old_api_drained=0
old_api_drain_started=0
rehearsal_reused=0
stage=test
${block}
printf 'drained=%s backup=%s sha=%s\n' "$old_api_drained" "$cutover_backup_name" "$cutover_backup_sha"
`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        MOCK_BACKUP_ROOT: backupRoot,
        MOCK_BACKUP_TOOL: backupTool,
        MOCK_CUTOVER_RECORD_DIR: cutoverRecordDir,
        MOCK_EXIT_STATE: exitState,
        MOCK_ORDER_FILE: orderFile,
        MOCK_RUNTIME_COMPOSE: runtimeCompose,
        MOCK_RUNTIME_ENV: runtimeEnv,
        MOCK_STALE_BACKUP: String(stale),
        MOCK_STATE_FILE: stateFile,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      },
    });

    const success = run();
    assert.equal(success.status, 0, success.stderr);
    assert.match(success.stdout, /drained=1 backup=icao-20260904T010203Z-42.dump sha=[a-f0-9]{64}/u);
    assert.deepEqual((await readFile(orderFile, 'utf8')).trim().split('\n'), [
      'old_inflight_request_completed',
      'backup_started_after_drain',
    ]);

    await rm(cutoverRecordDir, { force: true, recursive: true });
    await rm(join(backupRoot, 'icao-20260904T010203Z-42.dump'), { force: true });
    await rm(join(backupRoot, 'icao-20260904T010203Z-42.dump.sha256'), { force: true });
    await writeFile(stateFile, 'true\n');
    await writeFile(orderFile, '');
    const stale = run({ stale: 1 });
    assert.notEqual(stale.status, 0);

    await rm(cutoverRecordDir, { force: true, recursive: true });
    await writeFile(stateFile, 'true\n');
    const forcedKill = run({ exitState: '137 false' });
    assert.notEqual(forcedKill.status, 0);
    assert.match(forcedKill.stderr, /did not complete a graceful/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('migration gates follow the reviewed schema table inventory and reject incomplete or unsafe evidence', async () => {
  for (const file of ['scripts/rehearse-production-migrations.sh', 'scripts/apply-production-migrations.sh']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const guard = source.match(/if \(p\.status !== "verified"[\s\S]*?process\.exit\(1\);\n\s+\}/u)?.[0];
    assert.ok(guard, file);
    const valid = { status: 'verified', readOnly: true, requiredTables: SERVER_ONLY_PUBLIC_TABLES.length,
      expectedPublicTables: SERVER_ONLY_PUBLIC_TABLES.length, actualPublicTables: SERVER_ONLY_PUBLIC_TABLES.length,
      unclassifiedPublicTables: 0, missingPublicTables: 0, commerceProducts: 4, appleProductMappings: 5,
      unvalidatedConstraints: 0, serverOnlyClientGrants: 0, unexpectedPublicTableOwners: 0,
      defaultAclOwners: 1, serverOnlyClientDefaultTableGrants: 0, deviceDigestColumns: 0 };
    const run = value => spawnSync(process.execPath, ['-e', `const p=JSON.parse(process.argv[1]);${guard}`, JSON.stringify(value)], { encoding: 'utf8' });
    assert.equal(run(valid).status, 0, file);
    assert.equal(run({ ...valid, requiredTables: 67, expectedPublicTables: 67, actualPublicTables: 67 }).status, 0, file);
    for (const mutation of [{ actualPublicTables: valid.actualPublicTables - 1 }, { requiredTables: 0 },
      { requiredTables: 0, expectedPublicTables: 0, actualPublicTables: 0 }, { unclassifiedPublicTables: 1 },
      { missingPublicTables: 1 }, { serverOnlyClientGrants: 1 }, { serverOnlyClientDefaultTableGrants: 1 },
      { unexpectedPublicTableOwners: 1 }, { readOnly: false }, { status: 'failed' }]) {
      assert.equal(run({ ...valid, ...mutation }).status, 1, `${file}: ${JSON.stringify(mutation)}`);
    }
  }
});
