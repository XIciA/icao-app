import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertMonotonicRowCounts,
  assertProductionMigrationConfirmation,
  parseRehearsalSuccess,
  productionMigrationConfirmation,
  validatePlanTransition,
} from './production-migration-apply-lib.mjs';
import { SERVER_ONLY_SENSITIVE_TABLES } from '../services/api/scripts/production-schema-contract-data.mjs';

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

test('allows concurrent additions while rejecting any protected row-count decrease', () => {
  assert.deepEqual(assertMonotonicRowCounts(100, 100, 'users'), {
    additions: 0,
    after: 100,
    before: 100,
  });
  assert.deepEqual(assertMonotonicRowCounts(100, 107, 'users'), {
    additions: 7,
    after: 107,
    before: 100,
  });
  assert.throws(() => assertMonotonicRowCounts(100, 99, 'users'), /users_decreased/u);
});

test('keeps the complete sensitive server-only table contract frozen', () => {
  const mandatoryTables = [
    'account_content_credential_revocations',
    'account_deletion_auth_users',
    'account_deletion_jobs',
    'account_deletion_status_rate_limits',
    'account_deletion_tombstones',
    'account_security_events',
    'accounts',
    'ai_consent_authorities',
    'ai_consent_challenges',
    'ai_point_batches',
    'ai_point_ledger_entries',
    'ai_point_reservations',
    'apple_credential_intakes',
    'apple_notification_events',
    'apple_revocable_credentials',
    'apple_transactions',
    'commerce_channel_products',
    'commerce_orders',
    'commerce_products',
    'content_access_credentials',
    'content_environment_session_grants',
    'lifetime_identity_benefit_claims',
    'membership_entitlement_segments',
    'ops_audit_events',
    'ops_change_previews',
    'ops_entitlement_adjustments',
    'ops_staff_accounts',
    'ops_staff_recovery_codes',
    'ops_staff_sessions',
    'phone_otp_intents',
    'privacy_action_receipts',
    'recent_auth_challenges',
    'recent_auth_grants',
    'sms_delivery_attempts',
    'sms_usage_counters',
  ];
  for (const table of mandatoryTables) {
    assert.ok(SERVER_ONLY_SENSITIVE_TABLES.includes(table), `missing sensitive table: ${table}`);
  }
  assert.equal(new Set(SERVER_ONLY_SENSITIVE_TABLES).size, SERVER_ONLY_SENSITIVE_TABLES.length);
  assert.ok(SERVER_ONLY_SENSITIVE_TABLES.includes('ai_point_reservation_allocations'));
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

test('evidence publication fails closed when protection, linking, or final validation fails', async () => {
  const source = await readFile(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const start = source.indexOf('# BEGIN production-migration-evidence-publication');
  const endMarker = '# END production-migration-evidence-publication';
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start);
  const publication = source.slice(start, end + endMarker.length);
  const root = await mkdtemp(join(tmpdir(), 'icao-production-evidence-'));
  try {
    const realChmod = spawnSync('/bin/sh', ['-c', 'command -v chmod'], { encoding: 'utf8' }).stdout.trim();
    const realLn = spawnSync('/bin/sh', ['-c', 'command -v ln'], { encoding: 'utf8' }).stdout.trim();
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
      await writeFile(join(fakeBin, 'ln'), `#!/bin/sh
[ "\${MOCK_EVIDENCE_FAILURE:-}" = link ] && exit 42
exec "\${REAL_LN:?}" "$@"
`);
      await writeFile(join(fakeBin, 'rm'), `#!/bin/sh
if [ "\${MOCK_EVIDENCE_FAILURE:-}" = remove ] && [ ! -e "\${MOCK_RM_STATE:?}" ]; then
  : > "\${MOCK_RM_STATE:?}"
  exit 43
fi
exec "\${REAL_RM:?}" "$@"
`);
      await chmod(join(fakeBin, 'chmod'), 0o700);
      await chmod(join(fakeBin, 'ln'), 0o700);
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
before_migrations=15
after_migrations=33
before_business_rows=100
after_business_rows=101
business_rows_preserved=1
before_auth_users=10
after_auth_users=11
auth_users_preserved=1
schema_contract_sha=${'e'.repeat(64)}
cleanup_verified=1
publish_evidence succeeded
`], {
        encoding: 'utf8',
        env: {
          ...process.env,
          MOCK_EVIDENCE_FAILURE: scenario,
          MOCK_RM_STATE: join(caseRoot, 'rm-state'),
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          REAL_CHMOD: realChmod,
          REAL_LN: realLn,
          REAL_RM: realRm,
          TEST_EVIDENCE_DIR: evidenceDir,
        },
      });
      return { files: await readdir(evidenceDir), result };
    };

    for (const scenario of ['chmod', 'link', 'remove', 'guard']) {
      const { files, result } = await run(scenario);
      assert.notEqual(result.status, 0, scenario);
      assert.deepEqual(files, [], `${scenario} must not leave publishable evidence`);
    }
    const successful = await run('success');
    assert.equal(successful.result.status, 0, successful.result.stderr);
    assert.equal(successful.files.length, 1);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
