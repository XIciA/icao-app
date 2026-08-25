import { readFile } from 'node:fs/promises';

const [applySource, migrateSource, schemaVerifierSource, apiReleaseSource, opsReleaseSource, packageSource] = await Promise.all([
  readFile('scripts/apply-production-migrations.sh', 'utf8'),
  readFile('services/api/scripts/migrate.mjs', 'utf8'),
  readFile('services/api/scripts/verify-production-schema-contract.mjs', 'utf8'),
  readFile('scripts/deploy-api-release.sh', 'utf8'),
  readFile('scripts/deploy-ops-release.sh', 'utf8'),
  readFile('package.json', 'utf8'),
]);

for (const contract of [
  'check-mainline-release.mjs',
  '--print-confirmation',
  'ICAO_PRODUCTION_MIGRATION_CONFIRM',
  'APPLY_PRODUCTION_MIGRATIONS:',
  'ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN:-15:18:0',
  'ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN:-33:0:0',
  'rehearse-production-migrations.sh',
  'parse-rehearsal',
  'characters unsafe for remote argument transport',
  'git archive --format=tar "$SOURCE_SHA"',
  '/opt/icao/runtime/production-migrations',
  '# BEGIN production-migration-path-guard',
  '# END production-migration-path-guard',
  'stat -c \'%u:%a\'',
  'protected production migration path is a symlink:',
  'protected production lock path is a symlink:',
  'prepare_lock_file "$lock_path"',
  'icao-production-migration-apply.lock',
  'icao-production-migration-rehearsal.lock',
  'icao-postgres-backup.lock',
  'icao-production-release-change.lock',
  'backup_age',
  'rehearsal_age',
  'actual_backup_checksum_line=',
  'preexisting_fingerprint_mismatches',
  'cleanup_verified',
  'test "$pre_summary" = "$expected_pre_plan"',
  'test "$post_summary" = "$expected_post_plan"',
  'scripts/migrate.mjs --production-apply',
  'migration-plan.mjs --require-current',
  'verify-production-schema-contract.mjs',
  'business_rows_preserved=1',
  'auth_users_preserved=1',
  'automatic_production_restore=forbidden',
  'manual_authorization_required_choose_forward_fix_or_verified_restore',
  'restore-isolated.sh',
  'publish_evidence failed',
  'publish_evidence succeeded',
  'ln "$partial" "$evidence"',
  'require_root_owned_path file "$evidence" 600',
  'production_migration_apply_ok',
]) {
  if (!applySource.includes(contract)) {
    throw new Error(`production_migration_apply_contract_missing:${contract}`);
  }
}

for (const dangerousContract of [
  /dropdb[^\n]*\bpostgres\b/u,
  /pg_restore[^\n]*-d[ ="']+postgres\b/u,
  /psql[^\n]*\b(drop database|truncate|delete from)\b/iu,
  /automatic_production_restore=(?:enabled|true|1)/u,
]) {
  if (dangerousContract.test(applySource)) {
    throw new Error(`production_migration_apply_dangerous_contract:${dangerousContract}`);
  }
}

const migrateStart = applySource.indexOf('scripts/migrate.mjs --production-apply');
const confirmationCheck = applySource.indexOf('node "$CONTRACT_TOOL" confirm');
const rehearsalStart = applySource.indexOf('scripts/rehearse-production-migrations.sh');
const remoteStart = applySource.indexOf("<<'REMOTE'");
const postCurrent = applySource.indexOf('migration-plan.mjs --require-current', migrateStart);
const schemaVerification = applySource.indexOf('verify-production-schema-contract.mjs', postCurrent);
const cleanup = applySource.indexOf('cleanup_remote_resources\ncleanup_verified=1', schemaVerification);
const success = applySource.indexOf('publish_evidence succeeded', cleanup);
if ([confirmationCheck, rehearsalStart, remoteStart, migrateStart, postCurrent, schemaVerification, cleanup, success]
  .some((value) => value < 0)
    || !(confirmationCheck < rehearsalStart && rehearsalStart < remoteStart && remoteStart < migrateStart)
    || !(migrateStart < postCurrent && postCurrent < schemaVerification
      && schemaVerification < cleanup && cleanup < success)) {
  throw new Error('production_migration_apply_success_order_invalid');
}

if (
  !migrateSource.includes("process.argv.includes('--production-apply')")
  || !migrateSource.includes('production_migration_wrapper_authorization_missing')
  || !migrateSource.includes('production_migration_image_identity_mismatch')
  || !migrateSource.includes('pg_try_advisory_lock')
  || !migrateSource.includes('pg_advisory_unlock')
  || !migrateSource.includes("lock_timeout: '15s'")
) {
  throw new Error('database_migrator_production_guard_incomplete');
}

for (const contract of [
  "default_transaction_read_only: true",
  "parsedUrl.hostname !== 'db'",
  "parsedUrl.search !== ''",
  "parsedUrl.pathname !== `/${expectedDatabase}`",
  'production_schema_has_unvalidated_constraints',
  'production_schema_required_rls_disabled',
  'production_schema_server_only_table_grant_present',
  'production_privacy_schema_columns_incomplete',
  'production_content_device_digest_still_present',
  'production_commerce_product_catalog_mismatch',
  'production_apple_product_mapping_mismatch',
]) {
  if (!schemaVerifierSource.includes(contract)) {
    throw new Error(`production_schema_verifier_contract_missing:${contract}`);
  }
}
if (!schemaVerifierSource.includes("expectedDatabase = process.env.ICAO_PRODUCTION_DATABASE_NAME")) {
  throw new Error('production_schema_verifier_database_binding_missing');
}

for (const releaseSource of [apiReleaseSource, opsReleaseSource]) {
  if (!releaseSource.includes('icao-production-release-change.lock')) {
    throw new Error('production_release_change_lock_missing');
  }
}
if (
  !packageSource.includes('check:production-migration')
  || !packageSource.includes('production-migration-apply-tests.mjs')
  || !packageSource.includes('check-production-migration-apply.mjs')
  || !packageSource.includes('scripts/apply-production-migrations.sh')
) {
  throw new Error('production_migration_release_gate_missing');
}

console.log('Production migration apply contracts verified.');
