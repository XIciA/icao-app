import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('missing_DATABASE_URL');
const productionApply = process.argv.includes('--production-apply');
const productionSourceSha = process.env.ICAO_PRODUCTION_MIGRATION_SOURCE_SHA ?? '';
if (productionApply) {
  if (!/^[a-f0-9]{40}$/u.test(productionSourceSha)) {
    throw new Error('production_migration_source_sha_invalid');
  }
  if (process.env.ICAO_PRODUCTION_MIGRATION_APPLY !== `apply:${productionSourceSha}`) {
    throw new Error('production_migration_wrapper_authorization_missing');
  }
  if (process.env.API_RELEASE_ID !== `production-migration-${productionSourceSha.slice(0, 12)}`) {
    throw new Error('production_migration_image_identity_mismatch');
  }
}

const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
  connection: {
    application_name: productionApply
      ? 'icao_production_migration_apply'
      : 'icao_database_migration',
    lock_timeout: '15s',
    statement_timeout: '10min',
  },
});
let advisoryLockAcquired = false;

try {
  const [lock] = await client`select pg_try_advisory_lock(7342061, 100) as acquired`;
  if (lock?.acquired !== true) throw new Error('database_migration_advisory_lock_unavailable');
  advisoryLockAcquired = true;
  await migrate(drizzle(client), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
  console.log('database_migrations_applied');
} catch (error) {
  if (productionApply) {
    const errorName = error instanceof Error && /^[A-Za-z][A-Za-z0-9]*$/u.test(error.name)
      ? error.name
      : 'UnknownError';
    const errorCode = error && typeof error === 'object' && 'code' in error
      && typeof error.code === 'string' && /^[A-Za-z0-9_]{1,32}$/u.test(error.code)
      ? error.code
      : 'unknown';
    console.error(`production_database_migration_failed:${errorName}:${errorCode}`);
  } else {
    console.error(error instanceof Error ? error.stack : error);
    if (error && typeof error === 'object' && 'cause' in error) console.error(error.cause);
  }
  process.exitCode = 1;
} finally {
  if (advisoryLockAcquired) {
    try {
      const [unlock] = await client`select pg_advisory_unlock(7342061, 100) as released`;
      if (unlock?.released !== true) {
        console.error('database_migration_advisory_unlock_failed');
        process.exitCode = 1;
      }
    } catch {
      console.error('database_migration_advisory_unlock_failed');
      process.exitCode = 1;
    }
  }
  await client.end({ timeout: 5 });
}
