import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  buildMigrationPlan,
  formatMigrationPlan,
  isMigrationPlanCurrent,
  loadLocalMigrations,
} from './migration-plan-lib.mjs';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const commerceMigrationPath = fileURLToPath(new URL('../drizzle/0015_commerce_domain.sql', import.meta.url));
const commerceSnapshotPath = fileURLToPath(new URL('../drizzle/meta/0015_snapshot.json', import.meta.url));
const schemaPath = fileURLToPath(new URL('../src/database/schema.ts', import.meta.url));
const legacyTables = [
  'accounts',
  'profiles',
  'account_identities',
  'account_merges',
  'account_session_revocations',
  'question_bank_releases',
  'resource_objects',
  'editorial_releases',
  'invite_accounts',
  'invite_login_attempts',
  'feedback_tickets',
  'feedback_attachments',
  'user_card_states',
  'learning_records',
  'sync_mutations',
  'user_documents',
  'sync_changes',
  'ai_consents',
  'ai_usage_logs',
  'ai_quota_buckets',
  'ai_word_cache',
];
const commerceTables = [
  'commerce_products',
  'commerce_channel_products',
  'commerce_orders',
  'apple_transactions',
  'apple_notification_events',
  'membership_entitlement_segments',
  'ai_point_batches',
  'ai_point_reservations',
  'ai_point_reservation_allocations',
  'ai_point_ledger_entries',
];
const allTables = [...legacyTables, ...commerceTables];

test('loads the repository journal with the exact Drizzle hashes', async () => {
  const migrations = await loadLocalMigrations(migrationsFolder);
  assert.ok(migrations.length >= 16);
  assert.equal(migrations[8].tag, '0008_editorial_releases');
  assert.equal(
    migrations[8].hash,
    '3b2e86cbe4e0f0d75a6036aa39b8645d3e918b20eed4e72d9b5bc569b20b2d55',
  );
  assert.equal(migrations[9].tag, '0009_invite_accounts');
  assert.equal(
    migrations[9].hash,
    'eb3b9593e4208b5df1a87d8ba45837e692489f6d8640508f87708c38d4a21804',
  );
  assert.equal(migrations[10].tag, '0010_common_virginia_dare');
  assert.equal(migrations[13].tag, '0013_futuristic_wilson_fisk');
  assert.equal(migrations[14].tag, '0014_feedback_ticket_retention');
  assert.match(migrations[14].hash, /^[a-f0-9]{64}$/);
  assert.equal(migrations[15].tag, '0015_commerce_domain');
  assert.match(migrations[15].hash, /^[a-f0-9]{64}$/);
});

test('locks all 31 tables behind RLS and keeps commerce tables server-only', async () => {
  const migrations = await loadLocalMigrations(migrationsFolder);
  const [migrationSql, snapshotJson, schemaSource, cumulativeMigrationSql] = await Promise.all([
    readFile(commerceMigrationPath, 'utf8'),
    readFile(commerceSnapshotPath, 'utf8'),
    readFile(schemaPath, 'utf8'),
    Promise.all(migrations.map((migration) => (
      readFile(join(migrationsFolder, `${migration.tag}.sql`), 'utf8')
    ))).then((contents) => contents.join('\n')),
  ]);
  const snapshot = JSON.parse(snapshotJson);
  assert.equal(allTables.length, 31);
  for (const table of allTables) {
    assert.ok(
      cumulativeMigrationSql.includes(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`),
      `missing_rls:${table}`,
    );
    assert.equal(
      snapshot.tables[`public.${table}`]?.isRLSEnabled,
      true,
      `snapshot_rls_disabled:${table}`,
    );
    const tableStart = schemaSource.indexOf(`pgTable('${table}'`);
    const nextTableStart = schemaSource.indexOf('\nexport const ', tableStart + 1);
    const tableBlock = schemaSource.slice(
      tableStart,
      nextTableStart === -1 ? schemaSource.length : nextTableStart,
    );
    assert.ok(tableStart >= 0 && tableBlock.includes('.enableRLS();'), `schema_rls_disabled:${table}`);
  }
  for (const table of commerceTables) {
    assert.ok(
      migrationSql.includes(`REVOKE ALL ON TABLE "${table}" FROM anon, authenticated;`),
      `missing_anon_authenticated_revoke:${table}`,
    );
  }
  assert.ok(
    migrationSql.includes(
      'REVOKE ALL ON SEQUENCE "ai_point_ledger_entries_sequence_seq" FROM anon, authenticated;',
    ),
    'missing_anon_authenticated_sequence_revoke:ai_point_ledger_entries_sequence_seq',
  );
});

test('enforces commerce environment and account ownership through composite database keys', async () => {
  const migrationSql = await readFile(commerceMigrationPath, 'utf8');
  const requiredConstraints = [
    'CONSTRAINT "commerce_orders_identity" UNIQUE("id","environment","account_id")',
    'CONSTRAINT "membership_segments_identity" UNIQUE("id","environment","account_id")',
    'CONSTRAINT "ai_point_batches_identity" UNIQUE("id","environment","account_id")',
    'CONSTRAINT "ai_point_reservations_identity" UNIQUE("id","environment","account_id")',
    '"apple_transactions_order_environment_account_fk" FOREIGN KEY ("order_id","environment","account_id") REFERENCES "public"."commerce_orders"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade',
    '"membership_segments_order_environment_account_fk" FOREIGN KEY ("order_id","environment","account_id") REFERENCES "public"."commerce_orders"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade',
    '"ai_point_batches_order_environment_account_fk" FOREIGN KEY ("source_order_id","environment","account_id") REFERENCES "public"."commerce_orders"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade',
    '"ai_point_batches_segment_environment_account_fk" FOREIGN KEY ("entitlement_segment_id","environment","account_id") REFERENCES "public"."membership_entitlement_segments"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade',
    '"ai_point_allocations_reservation_environment_account_fk" FOREIGN KEY ("reservation_id","environment","account_id") REFERENCES "public"."ai_point_reservations"("id","environment","account_id") ON DELETE cascade ON UPDATE cascade',
    '"ai_point_allocations_batch_environment_account_fk" FOREIGN KEY ("batch_id","environment","account_id") REFERENCES "public"."ai_point_batches"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade',
    '"ai_point_ledger_batch_environment_account_fk" FOREIGN KEY ("batch_id","environment","account_id") REFERENCES "public"."ai_point_batches"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade',
    '"ai_point_ledger_reservation_environment_account_fk" FOREIGN KEY ("reservation_id","environment","account_id") REFERENCES "public"."ai_point_reservations"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade',
    '"direction" text NOT NULL',
    '"ai_point_ledger_direction_check" CHECK ("ai_point_ledger_entries"."direction" IN (\'credit\', \'debit\', \'neutral\'))',
    '"ai_point_ledger_entry_direction_pair_check" CHECK',
    '"ai_point_batch_interval_days" integer NOT NULL',
    '"commerce_products_ai_batch_interval_positive" CHECK ("commerce_products"."ai_point_batch_interval_days" > 0)',
  ];
  for (const constraint of requiredConstraints) {
    assert.ok(migrationSql.includes(constraint), `missing_commerce_scope_constraint:${constraint}`);
  }
});

test('defers reservation allocation, batch accounting, and timestamp invariants until commit', async () => {
  const migrationSql = await readFile(commerceMigrationPath, 'utf8');
  const requiredDeferredConstraints = [
    'commerce_reservation_allocation_total_mismatch',
    'commerce_batch_reserved_total_mismatch',
    'commerce_batch_consumed_total_mismatch',
    'commerce_merge_conservation_invalid',
    'commerce_merge_credit_operation_invalid',
    'ai_point_ledger_merge_credit_operation',
    'ai_point_ledger_merge_debit_batch',
    'merge_credit_points <> expected_credit_points',
    'commerce_reservation_settled_timestamp_invalid',
    'commerce_reservation_transition_invalid',
    'ai_point_allocations_reservation_total_deferred',
    'ai_point_reservations_allocation_total_deferred',
    'ai_point_allocations_batch_total_deferred',
    'ai_point_batches_totals_deferred',
    'ai_point_reservations_batch_total_deferred',
    'ai_point_ledger_batch_totals_deferred',
    'ai_point_reservations_state_deferred',
    'ai_point_reservations_transition_guard',
  ];
  for (const constraint of requiredDeferredConstraints) {
    assert.ok(migrationSql.includes(constraint), `missing_deferred_commerce_constraint:${constraint}`);
  }
  assert.equal(
    migrationSql.match(/DEFERRABLE INITIALLY DEFERRED/g)?.length,
    7,
    'all seven commerce constraint triggers must validate final transaction state',
  );
});

test('keeps ledger entry type and direction pairing aligned in schema, snapshot, and SQL', async () => {
  const [migrationSql, snapshotJson, schemaSource] = await Promise.all([
    readFile(commerceMigrationPath, 'utf8'),
    readFile(commerceSnapshotPath, 'utf8'),
    readFile(schemaPath, 'utf8'),
  ]);
  const constraintName = 'ai_point_ledger_entry_direction_pair_check';
  const snapshot = JSON.parse(snapshotJson);
  const snapshotConstraint = snapshot.tables['public.ai_point_ledger_entries']
    ?.checkConstraints?.[constraintName]?.value;
  assert.ok(migrationSql.includes(`CONSTRAINT "${constraintName}" CHECK`));
  assert.ok(schemaSource.includes(`check('${constraintName}'`));
  assert.match(snapshotConstraint, /merge_credit.*credit/s);
  assert.match(snapshotConstraint, /merge_debit.*debit/s);
  assert.match(snapshotConstraint, /settle.*neutral/s);
});

test('lists the complete suffix and warns that 0012/0013 cannot skip 0010/0011', async () => {
  const migrations = await loadLocalMigrations(migrationsFolder);
  const appliedRows = migrations.slice(0, 10).map((migration, index) => ({
    id: index + 1,
    hash: migration.hash,
    created_at: migration.createdAt,
  }));
  const plan = buildMigrationPlan(migrations, appliedRows);

  assert.equal(plan.safe, true);
  assert.equal(isMigrationPlanCurrent(plan), false);
  assert.equal(plan.appliedCount, 10);
  assert.deepEqual(
    plan.migrations.filter((migration) => migration.status === 'pending').map((migration) => migration.tag),
    [
      '0010_common_virginia_dare',
      '0011_easy_iron_fist',
      '0012_dry_sleeper',
      '0013_futuristic_wilson_fisk',
      '0014_feedback_ticket_retention',
      '0015_commerce_domain',
      '0016_useful_greymalkin',
      '0017_loving_cargill',
      '0018_chief_union_jack',
      '0019_ordinary_hex',
      '0020_bitter_maelstrom',
      '0021_unknown_doorman',
      '0022_workable_nekra',
      '0023_apple_notification_reconciliation',
      '0024_apple_notification_retry_queue',
      '0025_brief_ricochet',
      '0026_sad_joshua_kane',
    ],
  );
  assert.ok(
    plan.warnings.includes(
      '0012_0013_require_0010_0011_review_and_ordered_application_no_cherry_pick',
    ),
  );
  assert.match(formatMigrationPlan(plan, 'example.invalid/app'), /No migration or database write was executed/);
});

test('reports current only when the full exact journal has been applied', async () => {
  const migrations = await loadLocalMigrations(migrationsFolder);
  const appliedRows = migrations.map((migration, index) => ({
    id: index + 1,
    hash: migration.hash,
    created_at: migration.createdAt,
  }));

  assert.equal(isMigrationPlanCurrent(buildMigrationPlan(migrations, appliedRows)), true);
});

test('rejects a database hash that differs from the current SQL file', async () => {
  const migrations = await loadLocalMigrations(migrationsFolder);
  const plan = buildMigrationPlan(migrations, [{
    id: 1,
    hash: '0'.repeat(64),
    created_at: migrations[0].createdAt,
  }]);

  assert.equal(plan.safe, false);
  assert.equal(plan.driftCount, 1);
  assert.ok(plan.errors.some((error) => error.startsWith('migration_hash_mismatch:')));
});

test('rejects an applied migration after a missing predecessor', async () => {
  const migrations = await loadLocalMigrations(migrationsFolder);
  const plan = buildMigrationPlan(migrations, [{
    id: 2,
    hash: migrations[1].hash,
    created_at: migrations[1].createdAt,
  }]);

  assert.equal(plan.safe, false);
  assert.ok(plan.errors.includes('database_migration_history_is_not_a_prefix:0001_tense_mastermind'));
});

test('rejects migration records that are not present in the journal', async () => {
  const migrations = await loadLocalMigrations(migrationsFolder);
  const plan = buildMigrationPlan(migrations, [{
    id: 99,
    hash: 'f'.repeat(64),
    created_at: 1,
  }]);

  assert.equal(plan.safe, false);
  assert.ok(plan.errors.some((error) => error.startsWith('database_migration_not_in_journal:')));
});
