import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
const prePlan = '34:1:0';
const postPlan = '35:0:0';
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
    confirmation: expected.replace('34:1:0', '34:2:0'),
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
  assert.equal(schemaTables.length, 56);
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
    for (const directory of ['scripts/lib', 'tools']) await mkdir(join(fixture, directory), { recursive: true });
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
    const git = (...args) => spawnSync('git', args, { cwd: fixture, encoding: 'utf8' });
    assert.equal(git('init', '-b', 'main').status, 0);
    assert.equal(git('add', 'scripts', 'tools').status, 0);
    assert.equal(git('-c', 'user.name=ICAO Test', '-c', 'user.email=icao-test@example.invalid',
      'commit', '-m', 'test fixture').status, 0);
    const fixtureSha = git('rev-parse', 'HEAD').stdout.trim();
    assert.match(fixtureSha, /^[a-f0-9]{40}$/u);
    assert.equal(git('update-ref', 'refs/remotes/origin/main', fixtureSha).status, 0);

    const result = spawnSync('/bin/sh', [join(fixture, 'scripts/apply-production-migrations.sh'),
      '--print-confirmation'], {
      encoding: 'utf8',
      env: { ...process.env, ICAO_PRODUCTION_MIGRATION_SOURCE_ROOT: fixture },
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

test('Docker CLI argv model secures all six candidate runs against baked env and entrypoint state', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const candidateNames = ['target', 'pre-plan', 'apply', 'post-current', 'post-plan', 'schema'];
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
expected_image_release_id="$EXPECTED_RELEASE_ID"
image="$EXPECTED_IMAGE"
source_sha=${sourceSha}
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
archive_sha=${'c'.repeat(64)}
confirmation="APPLY_PRODUCTION_MIGRATIONS:${sourceSha}:${prePlan}:${postPlan}"
backup_name=${backupName}
backup_sha=${'d'.repeat(64)}
backup="/opt/icao/backups/postgres/${backupName}"
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
