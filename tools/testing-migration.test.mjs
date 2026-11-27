import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';

for (const [label, environment] of Object.entries({
  productionDatabase: { DATABASE_URL: 'postgresql://postgres:fixture@db:5432/postgres' },
  productionNode: { NODE_ENV: 'production' },
  unlabelled: { ICAO_DATA_ENVIRONMENT: '' },
  productionHost: { DATABASE_URL: 'postgresql://postgres:fixture@supabase-db:5432/icao_testing' },
  queryOverride: { DATABASE_URL: 'postgresql://postgres:fixture@db:5432/icao_testing?host=production' },
})) {
  test(`testing migration rejects ${label} before any database connection`, () => {
    const result = spawnSync(process.execPath, ['services/api/scripts/migrate.mjs', '--testing-apply'], {
      encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test', ICAO_DATA_ENVIRONMENT: 'testing',
        DATABASE_URL: 'postgresql://postgres:fixture@db:5432/icao_testing', ...environment },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /testing_migration_target_invalid/);
    assert.doesNotMatch(result.stderr, /ECONNREFUSED|ENOTFOUND|CONNECT_TIMEOUT/);
  });
}
