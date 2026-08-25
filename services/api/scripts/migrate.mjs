import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('missing_DATABASE_URL');
const migrationModes = process.argv.slice(2);
const supportedModes = new Set([
  '--development-apply',
  '--isolated-rehearsal',
  '--production-apply',
]);
if (migrationModes.length !== 1 || !supportedModes.has(migrationModes[0])) {
  throw new Error('migration_mode_required');
}

const migrationMode = migrationModes[0];
const productionApply = migrationMode === '--production-apply';
const isolatedRehearsal = migrationMode === '--isolated-rehearsal';
const developmentApply = migrationMode === '--development-apply';
const productionSourceSha = process.env.ICAO_PRODUCTION_MIGRATION_SOURCE_SHA ?? '';
const parsedDatabaseUrl = new URL(databaseUrl);

if (productionApply) {
  if (!/^[a-f0-9]{40}$/u.test(productionSourceSha)) {
    throw new Error('production_migration_source_sha_invalid');
  }
  const expectedPrePlan = process.env.ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN ?? '';
  const expectedPostPlan = process.env.ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN ?? '';
  if (!/^(0|[1-9][0-9]*):(0|[1-9][0-9]*):0$/u.test(expectedPrePlan)
    || !/^(0|[1-9][0-9]*):0:0$/u.test(expectedPostPlan)) {
    throw new Error('production_migration_plan_binding_invalid');
  }
  const [preApplied, prePending] = expectedPrePlan.split(':').map(Number);
  const [postApplied] = expectedPostPlan.split(':').map(Number);
  if (prePending < 1 || postApplied !== preApplied + prePending) {
    throw new Error('production_migration_plan_transition_invalid');
  }
  const expectedAuthorization = `apply:${productionSourceSha}:${expectedPrePlan}:${expectedPostPlan}`;
  if (process.env.ICAO_PRODUCTION_MIGRATION_APPLY !== expectedAuthorization) {
    throw new Error('production_migration_wrapper_authorization_missing');
  }
  const expectedConfirmation = `APPLY_PRODUCTION_MIGRATIONS:${productionSourceSha}:${expectedPrePlan}:${expectedPostPlan}`;
  if (process.env.ICAO_PRODUCTION_MIGRATION_CONFIRM !== expectedConfirmation) {
    throw new Error('production_migration_confirmation_binding_missing');
  }
  if (process.env.API_RELEASE_ID !== `production-migration-${productionSourceSha.slice(0, 12)}`) {
    throw new Error('production_migration_image_identity_mismatch');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)
    || parsedDatabaseUrl.hostname !== 'db'
    || parsedDatabaseUrl.pathname !== '/postgres'
    || parsedDatabaseUrl.search !== ''
    || parsedDatabaseUrl.hash !== ''
  ) {
    throw new Error('production_migration_database_target_invalid');
  }
} else if (isolatedRehearsal) {
  const rehearsalDatabase = process.env.ICAO_MIGRATION_REHEARSAL_DATABASE_NAME ?? '';
  if (!/^[a-f0-9]{40}$/u.test(productionSourceSha)) {
    throw new Error('migration_rehearsal_source_sha_invalid');
  }
  if (!/^icao_rehearsal_[a-f0-9]{12}_[a-f0-9]{32}$/u.test(rehearsalDatabase)) {
    throw new Error('migration_rehearsal_database_name_invalid');
  }
  if (process.env.ICAO_MIGRATION_REHEARSAL_AUTHORIZATION
    !== `rehearse:${productionSourceSha}:${rehearsalDatabase}`) {
    throw new Error('migration_rehearsal_wrapper_authorization_missing');
  }
  if (process.env.API_RELEASE_ID !== `migration-rehearsal-${productionSourceSha.slice(0, 12)}`) {
    throw new Error('migration_rehearsal_image_identity_mismatch');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)
    || parsedDatabaseUrl.hostname !== 'db'
    || parsedDatabaseUrl.pathname !== `/${rehearsalDatabase}`
    || parsedDatabaseUrl.search !== ''
    || parsedDatabaseUrl.hash !== ''
  ) {
    throw new Error('migration_rehearsal_database_target_invalid');
  }
} else if (developmentApply) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('development_migration_forbidden_in_production');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)
    || !['127.0.0.1', '::1', 'localhost'].includes(parsedDatabaseUrl.hostname)
    || parsedDatabaseUrl.search !== ''
    || parsedDatabaseUrl.hash !== ''
  ) {
    throw new Error('development_migration_requires_loopback_database');
  }
}

const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
  connection: {
    application_name: productionApply
      ? 'icao_production_migration_apply'
      : isolatedRehearsal
        ? 'icao_isolated_migration_rehearsal'
        : 'icao_development_database_migration',
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
