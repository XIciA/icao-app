import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  buildMigrationPlan,
  formatMigrationPlan,
  isMigrationPlanCurrent,
  loadLocalMigrations,
} from './migration-plan-lib.mjs';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

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
