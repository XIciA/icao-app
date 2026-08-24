import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

const migrationsDirectory = fileURLToPath(new URL('../drizzle', import.meta.url));
const clusterRoot = mkdtempSync(join(tmpdir(), 'icao-commerce-postgres-'));
const dataDirectory = join(clusterRoot, 'data');
const socketDirectory = join(clusterRoot, 'socket');
let port;

function requireBinary(name) {
  const result = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
  assert.equal(result.status, 0, `missing_required_postgres_binary:${name}`);
  return result.stdout.trim();
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const selectedPort = address.port;
      server.close((error) => (error ? reject(error) : resolve(selectedPort)));
    });
  });
}

function psql(input) {
  return spawnSync(requireBinary('psql'), [
    '-X',
    '-q',
    '-v',
    'ON_ERROR_STOP=1',
    '-h',
    socketDirectory,
    '-p',
    String(port),
    '-U',
    'postgres',
    '-d',
    'postgres',
  ], {
    input,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });
}

function queryScalar(sql) {
  return execFileSync(requireBinary('psql'), [
    '-X',
    '-qAt',
    '-h',
    socketDirectory,
    '-p',
    String(port),
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-c',
    sql,
  ], { encoding: 'utf8' }).trim();
}

function trialMergeTransaction({
  creditBatchId,
  creditPoints,
  label,
  sourceAccountId,
  sourceBatchId,
  sourceConsumed,
  sourceReservationId,
  targetAccountId,
  targetBatchId,
  targetConsumed,
  targetReservationId,
}) {
  const operationId = `trial-merge:${targetAccountId}:${sourceAccountId}`;
  const settlementRows = [
    { batchId: targetBatchId, consumed: targetConsumed, reservationId: targetReservationId },
    { batchId: sourceBatchId, consumed: sourceConsumed, reservationId: sourceReservationId },
  ].filter(({ consumed }) => consumed > 0);
  const reservations = settlementRows.length === 0 ? '' : `
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES
      ${settlementRows.map(({ consumed, reservationId }, index) => `('${reservationId}', 'production', '${targetAccountId}', '${label}-settle-${index}', 'transcription', 'ai-points-v1', ${consumed}, 'reserved')`).join(',\n      ')};
    INSERT INTO ai_point_reservation_allocations (
      environment, account_id, reservation_id, batch_id, points
    ) VALUES
      ${settlementRows.map(({ batchId, consumed, reservationId }) => `('production', '${targetAccountId}', '${reservationId}', '${batchId}', ${consumed})`).join(',\n      ')};
    UPDATE ai_point_reservations
    SET status = 'settled', settled_at = now()
    WHERE id IN (${settlementRows.map(({ reservationId }) => `'${reservationId}'`).join(', ')});
  `;
  return `
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, reserved_points, available_at, status
    ) VALUES
      ('${targetBatchId}', 'production', '${targetAccountId}', '${targetAccountId}', 'trial',
       '${label}-target', 'ai-points-v1', 0, 100, ${targetConsumed}, now(), 'available'),
      ('${sourceBatchId}', 'production', '${targetAccountId}', '${sourceAccountId}', 'trial',
       '${label}-source', 'ai-points-v1', 0, 100, ${sourceConsumed}, now(), 'available');
    ${reservations}
    UPDATE ai_point_batches
    SET status = 'merged', reserved_points = 0,
        consumed_points = CASE id
          WHEN '${targetBatchId}' THEN ${targetConsumed}
          ELSE ${sourceConsumed}
        END
    WHERE id IN ('${targetBatchId}', '${sourceBatchId}');
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, consumed_points, available_at, status
    ) VALUES (
      '${creditBatchId}', 'production', '${targetAccountId}', '${targetAccountId}', 'trial',
      'merge:${targetAccountId}:${sourceAccountId}', 'ai-points-v1', 0, 100,
      ${100 - creditPoints}, now(), 'available'
    );
    INSERT INTO ai_point_ledger_entries (
      environment, account_id, batch_id, operation_id, entry_type, direction, points
    ) VALUES
      ('production', '${targetAccountId}', '${targetBatchId}', '${operationId}',
       'merge_debit', 'debit', ${100 - targetConsumed}),
      ('production', '${targetAccountId}', '${sourceBatchId}', '${operationId}',
       'merge_debit', 'debit', ${100 - sourceConsumed}),
      ('production', '${targetAccountId}', '${creditBatchId}', '${operationId}',
       'merge_credit', 'credit', ${creditPoints});
    COMMIT;
  `;
}

before(async () => {
  port = await availablePort();
  mkdirSync(socketDirectory);
  const initdb = requireBinary('initdb');
  const pgCtl = requireBinary('pg_ctl');
  execFileSync(initdb, ['-D', dataDirectory, '-A', 'trust', '-U', 'postgres', '--no-locale'], {
    stdio: 'ignore',
  });
  execFileSync(pgCtl, [
    '-D',
    dataDirectory,
    '-o',
    `-F -k ${socketDirectory} -p ${port}`,
    '-w',
    'start',
  ], { stdio: 'ignore' });
  const bootstrap = psql(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      public boolean NOT NULL,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
  `);
  assert.equal(bootstrap.status, 0, bootstrap.stderr);
  assert.ok(existsSync(migrationsDirectory));
  const cumulativeMigration = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(migrationsDirectory, name), 'utf8'))
    .join('\n')
    .replaceAll('--> statement-breakpoint', '');
  const migration = psql(cumulativeMigration);
  assert.equal(migration.status, 0, migration.stderr);
});

after(() => {
  const pgCtl = requireBinary('pg_ctl');
  spawnSync(pgCtl, ['-D', dataDirectory, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  rmSync(clusterRoot, { recursive: true, force: true });
});

test('the cumulative migration enables RLS on all 31 public tables', () => {
  assert.equal(
    queryScalar(`
      SELECT COUNT(*)::text || ':' || COUNT(*) FILTER (WHERE relrowsecurity)::text
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
    `),
    '31:31',
  );
});

test('deferred commerce constraints enforce reservation transitions and batch accounting', () => {
  const accountId = '00000000-0000-4000-8000-000000000001';
  const batchOne = '10000000-0000-4000-8000-000000000001';
  const batchTwo = '10000000-0000-4000-8000-000000000002';
  const reservationOne = '20000000-0000-4000-8000-000000000001';
  const reserveForSettlement = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, reserved_points, available_at, status
    ) VALUES
      ('${batchOne}', 'production', '${accountId}', '${accountId}', 'trial', 'db-test-batch-1',
       'ai-points-v1', 0, 100, 4, now(), 'available'),
      ('${batchTwo}', 'production', '${accountId}', '${accountId}', 'trial', 'db-test-batch-2',
       'ai-points-v1', 0, 100, 6, now(), 'available');
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES (
      '${reservationOne}', 'production', '${accountId}', 'db-test-valid', 'transcription_opi',
      'ai-points-v1', 10, 'reserved'
    );
    INSERT INTO ai_point_reservation_allocations (
      environment, account_id, reservation_id, batch_id, points
    ) VALUES
      ('production', '${accountId}', '${reservationOne}', '${batchOne}', 4),
      ('production', '${accountId}', '${reservationOne}', '${batchTwo}', 6);
    COMMIT;
  `);
  assert.equal(reserveForSettlement.status, 0, reserveForSettlement.stderr);

  const settle = psql(`
    BEGIN;
    UPDATE ai_point_reservations
    SET status = 'settled', settled_at = now()
    WHERE id = '${reservationOne}';
    UPDATE ai_point_batches
    SET reserved_points = 0,
        consumed_points = CASE id WHEN '${batchOne}' THEN 4 ELSE 6 END
    WHERE id IN ('${batchOne}', '${batchTwo}');
    INSERT INTO ai_point_ledger_entries (
      environment, account_id, batch_id, reservation_id, operation_id, entry_type, direction, points
    ) VALUES
      ('production', '${accountId}', '${batchOne}', '${reservationOne}', 'db-test-valid', 'settle', 'neutral', 4),
      ('production', '${accountId}', '${batchTwo}', '${reservationOne}', 'db-test-valid', 'settle', 'neutral', 6);
    COMMIT;
  `);
  assert.equal(settle.status, 0, settle.stderr);
  assert.equal(
    queryScalar(`SELECT status || ':' || (settled_at IS NOT NULL)::text FROM ai_point_reservations WHERE id = '${reservationOne}'`),
    'settled:true',
  );
  assert.equal(
    queryScalar(`SELECT SUM(consumed_points)::text || ':' || SUM(reserved_points)::text FROM ai_point_batches WHERE id IN ('${batchOne}', '${batchTwo}')`),
    '10:0',
  );

  const idempotentSettle = psql(`
    UPDATE ai_point_reservations SET status = 'settled' WHERE id = '${reservationOne}';
  `);
  assert.equal(idempotentSettle.status, 0, idempotentSettle.stderr);

  const illegalTerminalTransition = psql(`
    BEGIN;
    UPDATE ai_point_reservations
    SET status = 'released', settled_at = NULL, released_at = now()
    WHERE id = '${reservationOne}';
    COMMIT;
  `);
  assert.notEqual(illegalTerminalTransition.status, 0);
  assert.match(illegalTerminalTransition.stderr, /commerce_reservation_transition_invalid/);
  assert.equal(
    queryScalar(`SELECT status FROM ai_point_reservations WHERE id = '${reservationOne}'`),
    'settled',
    'an illegal terminal transition must roll back',
  );

  const releaseBatch = '10000000-0000-4000-8000-000000000005';
  const releaseReservation = '20000000-0000-4000-8000-000000000005';
  const validRelease = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, reserved_points, available_at, status
    ) VALUES (
      '${releaseBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'db-test-release', 'ai-points-v1', 0, 100, 5, now(), 'available'
    );
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES (
      '${releaseReservation}', 'production', '${accountId}', 'db-test-release',
      'transcription', 'ai-points-v1', 5, 'reserved'
    );
    INSERT INTO ai_point_reservation_allocations VALUES (
      'production', '${accountId}', '${releaseReservation}', '${releaseBatch}', 5
    );
    COMMIT;
    BEGIN;
    UPDATE ai_point_reservations
    SET status = 'released', released_at = now()
    WHERE id = '${releaseReservation}';
    UPDATE ai_point_batches SET reserved_points = 0 WHERE id = '${releaseBatch}';
    INSERT INTO ai_point_ledger_entries (
      environment, account_id, batch_id, reservation_id, operation_id, entry_type, direction, points
    ) VALUES (
      'production', '${accountId}', '${releaseBatch}', '${releaseReservation}',
      'db-test-release', 'release', 'credit', 5
    );
    COMMIT;
  `);
  assert.equal(validRelease.status, 0, validRelease.stderr);
  assert.equal(
    queryScalar(`SELECT reservation.status || ':' || batch.reserved_points::text || ':' || batch.consumed_points::text FROM ai_point_reservations reservation JOIN ai_point_batches batch ON batch.id = '${releaseBatch}' WHERE reservation.id = '${releaseReservation}'`),
    'released:0:0',
  );

  const noConsumedBatch = '10000000-0000-4000-8000-000000000006';
  const noConsumedReservation = '20000000-0000-4000-8000-000000000006';
  const reserveBeforeInvalidSettle = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, reserved_points, available_at, status
    ) VALUES (
      '${noConsumedBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'db-test-no-consumed-settle', 'ai-points-v1', 0, 100, 5, now(), 'available'
    );
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES (
      '${noConsumedReservation}', 'production', '${accountId}', 'db-test-no-consumed-settle',
      'transcription', 'ai-points-v1', 5, 'reserved'
    );
    INSERT INTO ai_point_reservation_allocations VALUES (
      'production', '${accountId}', '${noConsumedReservation}', '${noConsumedBatch}', 5
    );
    COMMIT;
  `);
  assert.equal(reserveBeforeInvalidSettle.status, 0, reserveBeforeInvalidSettle.stderr);
  const settleWithoutConsumed = psql(`
    BEGIN;
    UPDATE ai_point_reservations
    SET status = 'settled', settled_at = now()
    WHERE id = '${noConsumedReservation}';
    UPDATE ai_point_batches SET reserved_points = 0 WHERE id = '${noConsumedBatch}';
    COMMIT;
  `);
  assert.notEqual(settleWithoutConsumed.status, 0);
  assert.match(settleWithoutConsumed.stderr, /commerce_batch_consumed_total_mismatch/);
  assert.equal(
    queryScalar(`SELECT reservation.status || ':' || batch.reserved_points::text || ':' || batch.consumed_points::text FROM ai_point_reservations reservation JOIN ai_point_batches batch ON batch.id = '${noConsumedBatch}' WHERE reservation.id = '${noConsumedReservation}'`),
    'reserved:5:0',
    'a settle that does not transfer reserved points to consumed must roll back',
  );

  const mergedTrialBatch = '10000000-0000-4000-8000-000000000007';
  const mergedTargetDebitBatch = '10000000-0000-4000-8000-000000000009';
  const mergedSourceDebitBatch = '10000000-0000-4000-8000-000000000010';
  const sourceAccountId = '00000000-0000-4000-8000-000000000002';
  const validCarriedConsumption = psql(trialMergeTransaction({
    creditBatchId: mergedTrialBatch,
    creditPoints: 100,
    label: 'db-test-no-consumption-merge',
    sourceAccountId,
    sourceBatchId: mergedSourceDebitBatch,
    sourceConsumed: 0,
    sourceReservationId: '20000000-0000-4000-8000-000000000010',
    targetAccountId: accountId,
    targetBatchId: mergedTargetDebitBatch,
    targetConsumed: 0,
    targetReservationId: '20000000-0000-4000-8000-000000000009',
  }));
  assert.equal(validCarriedConsumption.status, 0, validCarriedConsumption.stderr);
  assert.equal(
    queryScalar(`
      SELECT
        SUM(points) FILTER (WHERE entry_type = 'merge_debit')::text || ':' ||
        SUM(points) FILTER (WHERE entry_type = 'merge_credit')::text || ':' ||
        COUNT(*) FILTER (WHERE entry_type = 'merge_credit')::text
      FROM ai_point_ledger_entries
      WHERE operation_id = 'trial-merge:${accountId}:${sourceAccountId}'
    `),
    '200:100:1',
  );

  const partialTargetAccountId = '00000000-0000-4000-8000-000000000011';
  const partialSourceAccountId = '00000000-0000-4000-8000-000000000012';
  const partialTargetBatch = '10000000-0000-4000-8000-000000000012';
  const partialSourceBatch = '10000000-0000-4000-8000-000000000013';
  const partialCreditBatch = '10000000-0000-4000-8000-000000000014';
  const exactPartialMerge = psql(trialMergeTransaction({
    creditBatchId: partialCreditBatch,
    creditPoints: 50,
    label: 'db-test-partial-consumption-merge',
    sourceAccountId: partialSourceAccountId,
    sourceBatchId: partialSourceBatch,
    sourceConsumed: 30,
    sourceReservationId: '20000000-0000-4000-8000-000000000013',
    targetAccountId: partialTargetAccountId,
    targetBatchId: partialTargetBatch,
    targetConsumed: 20,
    targetReservationId: '20000000-0000-4000-8000-000000000012',
  }));
  assert.equal(exactPartialMerge.status, 0, exactPartialMerge.stderr);
  assert.equal(
    queryScalar(`
      SELECT
        SUM(points) FILTER (WHERE entry_type = 'merge_debit')::text || ':' ||
        SUM(points) FILTER (WHERE entry_type = 'merge_credit')::text || ':' ||
        batch.consumed_points::text
      FROM ai_point_ledger_entries ledger
      JOIN ai_point_batches batch ON batch.id = '${partialCreditBatch}'
      WHERE ledger.operation_id = 'trial-merge:${partialTargetAccountId}:${partialSourceAccountId}'
      GROUP BY batch.consumed_points
    `),
    '150:50:50',
  );

  const wrongCreditTargetAccountId = '00000000-0000-4000-8000-000000000021';
  const wrongCreditSourceAccountId = '00000000-0000-4000-8000-000000000022';
  const fabricatedCredit = psql(trialMergeTransaction({
    creditBatchId: '10000000-0000-4000-8000-000000000017',
    creditPoints: 100,
    label: 'db-test-fabricated-credit',
    sourceAccountId: wrongCreditSourceAccountId,
    sourceBatchId: '10000000-0000-4000-8000-000000000016',
    sourceConsumed: 50,
    sourceReservationId: '20000000-0000-4000-8000-000000000016',
    targetAccountId: wrongCreditTargetAccountId,
    targetBatchId: '10000000-0000-4000-8000-000000000015',
    targetConsumed: 50,
    targetReservationId: '20000000-0000-4000-8000-000000000015',
  }));
  assert.notEqual(fabricatedCredit.status, 0);
  assert.match(fabricatedCredit.stderr, /commerce_merge_conservation_invalid/);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_batches WHERE account_id = '${wrongCreditTargetAccountId}'`),
    '0',
    'a merge credit larger than the exact post-consumption balance must roll back',
  );

  const duplicateCreditBatch = '10000000-0000-4000-8000-000000000018';
  const duplicateCredit = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, consumed_points, available_at, status
    ) VALUES (
      '${duplicateCreditBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'merge:${accountId}:${sourceAccountId}', 'ai-points-v1', 1, 100, 0, now(), 'available'
    );
    INSERT INTO ai_point_ledger_entries (
      environment, account_id, batch_id, operation_id, entry_type, direction, points
    ) VALUES (
      'production', '${accountId}', '${duplicateCreditBatch}',
      'trial-merge:${accountId}:${sourceAccountId}', 'merge_credit', 'credit', 100
    );
    COMMIT;
  `);
  assert.notEqual(duplicateCredit.status, 0);
  assert.match(duplicateCredit.stderr, /ai_point_ledger_merge_credit_operation/);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_batches WHERE id = '${duplicateCreditBatch}'`),
    '0',
    'a second target credit batch for one merge operation must roll back',
  );

  const reusedDebitCreditBatch = '10000000-0000-4000-8000-000000000019';
  const reusedDebit = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, consumed_points, available_at, status
    ) VALUES (
      '${reusedDebitCreditBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'merge:${accountId}:00000000-0000-4000-8000-000000000003',
      'ai-points-v1', 0, 100, 0, now(), 'available'
    );
    INSERT INTO ai_point_ledger_entries (
      environment, account_id, batch_id, operation_id, entry_type, direction, points
    ) VALUES
      ('production', '${accountId}', '${mergedTargetDebitBatch}',
       'trial-merge:${accountId}:00000000-0000-4000-8000-000000000003', 'merge_debit', 'debit', 100),
      ('production', '${accountId}', '${mergedSourceDebitBatch}',
       'trial-merge:${accountId}:00000000-0000-4000-8000-000000000003', 'merge_debit', 'debit', 100),
      ('production', '${accountId}', '${reusedDebitCreditBatch}',
       'trial-merge:${accountId}:00000000-0000-4000-8000-000000000003', 'merge_credit', 'credit', 100);
    COMMIT;
  `);
  assert.notEqual(reusedDebit.status, 0);
  assert.match(reusedDebit.stderr, /ai_point_ledger_merge_debit_batch/);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_batches WHERE id = '${reusedDebitCreditBatch}'`),
    '0',
    'a debit batch already consumed by one credit operation must not back another credit',
  );

  const unbackedMergeBatch = '10000000-0000-4000-8000-000000000011';
  const unbackedMergeCredit = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, consumed_points, available_at, status
    ) VALUES (
      '${unbackedMergeBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'merge:${accountId}:00000000-0000-4000-8000-000000000003',
      'ai-points-v1', 0, 100, 0, now(), 'available'
    );
    INSERT INTO ai_point_ledger_entries (
      environment, account_id, batch_id, operation_id, entry_type, direction, points
    ) VALUES (
      'production', '${accountId}', '${unbackedMergeBatch}',
      'trial-merge:${accountId}:00000000-0000-4000-8000-000000000003',
      'merge_credit', 'credit', 100
    );
    COMMIT;
  `);
  assert.notEqual(unbackedMergeCredit.status, 0);
  assert.match(unbackedMergeCredit.stderr, /commerce_merge_conservation_invalid/);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_batches WHERE id = '${unbackedMergeBatch}'`),
    '0',
    'an unbacked merge credit must roll back its fabricated target batch',
  );

  const invalidReservation = '20000000-0000-4000-8000-000000000002';
  const invalidReservationBatch = '10000000-0000-4000-8000-000000000003';
  const reservationMismatch = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, reserved_points, available_at, status
    ) VALUES (
      '${invalidReservationBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'db-test-invalid-reservation', 'ai-points-v1', 0, 100, 9, now(), 'available'
    );
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES (
      '${invalidReservation}', 'production', '${accountId}', 'db-test-invalid-reservation',
      'transcription_opi', 'ai-points-v1', 10, 'reserved'
    );
    INSERT INTO ai_point_reservation_allocations VALUES (
      'production', '${accountId}', '${invalidReservation}', '${invalidReservationBatch}', 9
    );
    COMMIT;
  `);
  assert.notEqual(reservationMismatch.status, 0);
  assert.match(reservationMismatch.stderr, /commerce_reservation_allocation_total_mismatch/);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_reservations WHERE id = '${invalidReservation}'`),
    '0',
    'failed deferred reservation commit must roll back every row',
  );

  const invalidBatchReservation = '20000000-0000-4000-8000-000000000003';
  const invalidBatch = '10000000-0000-4000-8000-000000000004';
  const batchMismatch = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, reserved_points, available_at, status
    ) VALUES (
      '${invalidBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'db-test-invalid-batch', 'ai-points-v1', 0, 100, 9, now(), 'available'
    );
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES (
      '${invalidBatchReservation}', 'production', '${accountId}', 'db-test-invalid-batch',
      'transcription_opi', 'ai-points-v1', 10, 'reserved'
    );
    INSERT INTO ai_point_reservation_allocations VALUES (
      'production', '${accountId}', '${invalidBatchReservation}', '${invalidBatch}', 10
    );
    COMMIT;
  `);
  assert.notEqual(batchMismatch.status, 0);
  assert.match(batchMismatch.stderr, /commerce_batch_reserved_total_mismatch/);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_batches WHERE id = '${invalidBatch}'`),
    '0',
    'failed deferred batch commit must roll back every row',
  );

  const invalidTimestampBatch = '10000000-0000-4000-8000-000000000008';
  const invalidTimestampReservation = '20000000-0000-4000-8000-000000000008';
  const timestampSetup = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, reserved_points, available_at, status
    ) VALUES (
      '${invalidTimestampBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'db-test-invalid-timestamp', 'ai-points-v1', 0, 100, 5, now(), 'available'
    );
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES (
      '${invalidTimestampReservation}', 'production', '${accountId}', 'db-test-invalid-timestamp',
      'transcription', 'ai-points-v1', 5, 'reserved'
    );
    INSERT INTO ai_point_reservation_allocations VALUES (
      'production', '${accountId}', '${invalidTimestampReservation}', '${invalidTimestampBatch}', 5
    );
    COMMIT;
  `);
  assert.equal(timestampSetup.status, 0, timestampSetup.stderr);
  const invalidTimestamp = psql(`
    BEGIN;
    UPDATE ai_point_reservations
    SET status = 'settled', settled_at = created_at - interval '1 second'
    WHERE id = '${invalidTimestampReservation}';
    UPDATE ai_point_batches
    SET reserved_points = 0, consumed_points = 5
    WHERE id = '${invalidTimestampBatch}';
    COMMIT;
  `);
  assert.notEqual(invalidTimestamp.status, 0);
  assert.match(invalidTimestamp.stderr, /commerce_reservation_settled_timestamp_invalid/);
  assert.equal(
    queryScalar(`SELECT status FROM ai_point_reservations WHERE id = '${invalidTimestampReservation}'`),
    'reserved',
  );

  const invalidDirection = psql(`
    INSERT INTO ai_point_ledger_entries (
      environment, account_id, batch_id, operation_id, entry_type, direction, points
    ) VALUES (
      'production', '${accountId}', '${batchOne}', 'db-test-invalid-direction', 'grant', 'debit', 1
    );
  `);
  assert.notEqual(invalidDirection.status, 0);
  assert.match(invalidDirection.stderr, /ai_point_ledger_entry_direction_pair_check/);
});
