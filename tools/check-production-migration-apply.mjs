import { readFile } from 'node:fs/promises';

import {
  PUBLIC_TABLE_ACCESS_CLASSIFICATION,
  SERVER_ONLY_PUBLIC_TABLES,
} from '../services/api/scripts/production-schema-contract-data.mjs';

const [
  applySource,
  migrateSource,
  rehearsalSource,
  databaseSchemaSource,
  schemaVerifierSource,
  schemaContractLibSource,
  schemaContractTestSource,
  apiReleaseSource,
  opsReleaseSource,
  packageSource,
  apiPackageSource,
] = await Promise.all([
  readFile('scripts/apply-production-migrations.sh', 'utf8'),
  readFile('services/api/scripts/migrate.mjs', 'utf8'),
  readFile('scripts/rehearse-production-migrations.sh', 'utf8'),
  readFile('services/api/src/database/schema.ts', 'utf8'),
  readFile('services/api/scripts/verify-production-schema-contract.mjs', 'utf8'),
  readFile('services/api/scripts/production-schema-contract-lib.mjs', 'utf8'),
  readFile('services/api/scripts/production-schema-contract-tests.mjs', 'utf8'),
  readFile('scripts/deploy-api-release.sh', 'utf8'),
  readFile('scripts/deploy-ops-release.sh', 'utf8'),
  readFile('package.json', 'utf8'),
  readFile('services/api/package.json', 'utf8'),
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
  '# BEGIN production-migration-upload-name-validation',
  '# END production-migration-upload-name-validation',
  '# BEGIN production-migration-remote-prepare',
  '# END production-migration-remote-prepare',
  'upload_identity=${upload#"$root"/uploads/source-}',
  'expected_upload=$root/uploads/source-$source_id-$upload_token.tar.gz',
  'expected_checksum=$expected_upload.sha256',
  '[ "${#source_id}" -ne 12 ]',
  '[ "${#upload_token}" -ne 32 ]',
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
  'ICAO_PRODUCTION_MIGRATION_APPLY="apply:$source_sha:$expected_pre_plan:$expected_post_plan"',
  'ICAO_PRODUCTION_MIGRATION_CONFIRM="$confirmation"',
  'ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN="$expected_pre_plan"',
  'ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN="$expected_post_plan"',
  'migration-plan.mjs --require-current',
  'verify-production-schema-contract.mjs',
  'p.expectedPublicTables !== 56',
  'p.actualPublicTables !== 56',
  'p.unclassifiedPublicTables !== 0',
  'p.missingPublicTables !== 0',
  'business_row_count_observation=non_authoritative_concurrent_activity_allowed',
  'auth_user_count_observation=non_authoritative_concurrent_activity_allowed',
  'data_preservation_authority=isolated_rehearsal_preexisting_table_fingerprint',
  'automatic_production_restore=forbidden',
  'manual_authorization_required_choose_forward_fix_or_verified_restore',
  'restore-isolated.sh',
  'publish_evidence failed',
  'publish_evidence succeeded',
  'require_root_owned_path file "$partial" 600',
  'mv -- "$partial" "$evidence"',
  'publication_state=complete',
  'production_migration_apply_ok',
]) {
  if (!applySource.includes(contract)) {
    throw new Error(`production_migration_apply_contract_missing:${contract}`);
  }
}

if (
  !applySource.includes('PRINT_CONFIRMATION=1')
  || !applySource.includes('check-mainline-release.mjs" --root "$SOURCE_ROOT" >/dev/null')
) {
  throw new Error('production_migration_confirmation_stdout_not_unique');
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
  !migrateSource.includes("'--development-apply'")
  || !migrateSource.includes("'--isolated-rehearsal'")
  || !migrateSource.includes("'--production-apply'")
  || !migrateSource.includes('migration_mode_required')
  || !migrateSource.includes('development_migration_forbidden_in_production')
  || !migrateSource.includes('production_migration_wrapper_authorization_missing')
  || !migrateSource.includes('production_migration_confirmation_binding_missing')
  || !migrateSource.includes('production_migration_image_identity_mismatch')
  || !migrateSource.includes('production_migration_database_target_invalid')
  || !migrateSource.includes('migration_rehearsal_wrapper_authorization_missing')
  || !migrateSource.includes('migration_rehearsal_image_identity_mismatch')
  || !migrateSource.includes('migration_rehearsal_database_target_invalid')
  || !migrateSource.includes('pg_try_advisory_lock')
  || !migrateSource.includes('pg_advisory_unlock')
  || !migrateSource.includes("lock_timeout: '15s'")
) {
  throw new Error('database_migrator_production_guard_incomplete');
}
if (
  !apiPackageSource.includes('"migration:apply": "node scripts/migrate.mjs --development-apply"')
  || !rehearsalSource.includes('scripts/migrate.mjs --isolated-rehearsal')
  || !rehearsalSource.includes('ICAO_MIGRATION_REHEARSAL_AUTHORIZATION="rehearse:$source_sha:$database_name"')
) {
  throw new Error('database_migrator_entrypoint_guard_incomplete');
}

for (const contract of [
  "default_transaction_read_only: true",
  "parsedUrl.hostname !== 'db'",
  "parsedUrl.search !== ''",
  "parsedUrl.pathname !== `/${expectedDatabase}`",
  'production_schema_has_unvalidated_constraints',
  "from information_schema.tables",
  "table_schema = 'public'",
  "table_type = 'BASE TABLE'",
  'actualTables: actualPublicTables',
  'expectedTables: serverOnlyTables',
  'assertPublicTableSecurityContract',
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
if ((schemaVerifierSource.match(/transaction\.array\(actualPublicTables\)/gu) ?? []).length < 2) {
  throw new Error('production_schema_verifier_must_check_all_actual_tables');
}
for (const failureCode of [
  'production_schema_unclassified_public_tables:',
  'production_schema_missing_public_tables:',
  'production_schema_required_rls_disabled',
  'production_schema_server_only_table_grant_present',
]) {
  if (!schemaContractLibSource.includes(failureCode)) {
    throw new Error(`production_schema_contract_failure_missing:${failureCode}`);
  }
}
for (const liveFailureContract of [
  'unexpected_public_table',
  'production_schema_unclassified_public_tables:1',
  'clientGrantCount: 1',
  'production_schema_server_only_table_grant_present',
]) {
  if (!schemaContractTestSource.includes(liveFailureContract)) {
    throw new Error(`production_schema_live_verifier_test_missing:${liveFailureContract}`);
  }
}
const schemaPublicTables = [...databaseSchemaSource.matchAll(/pgTable\('([^']+)'/gu)]
  .map((match) => match[1])
  .sort();
if (
  schemaPublicTables.length !== 56
  || JSON.stringify(schemaPublicTables) !== JSON.stringify(SERVER_ONLY_PUBLIC_TABLES)
  || JSON.stringify(Object.keys(PUBLIC_TABLE_ACCESS_CLASSIFICATION).sort())
    !== JSON.stringify(schemaPublicTables)
  || Object.values(PUBLIC_TABLE_ACCESS_CLASSIFICATION)
    .some((classification) => classification !== 'server_only')
) {
  throw new Error('production_schema_public_table_classification_incomplete');
}
if (!schemaVerifierSource.includes('SERVER_ONLY_PUBLIC_TABLES')) {
  throw new Error('production_schema_verifier_canonical_table_source_missing');
}

const imageCleanupStart = applySource.indexOf('# BEGIN production-migration-image-cleanup');
const imageCleanupEnd = applySource.indexOf('# END production-migration-image-cleanup');
const imageCleanupSource = applySource.slice(imageCleanupStart, imageCleanupEnd);
const evidenceStart = applySource.indexOf('# BEGIN production-migration-evidence-publication');
const evidenceEnd = applySource.indexOf('# END production-migration-evidence-publication');
const evidenceSource = applySource.slice(evidenceStart, evidenceEnd);
if (
  imageCleanupStart < 0
  || imageCleanupEnd <= imageCleanupStart
  || !imageCleanupSource.includes('if ! docker image inspect "$image"')
  || !imageCleanupSource.includes('if ! docker image rm "$image"')
  || !imageCleanupSource.includes('if ! remaining_images=$(docker image ls')
  || !imageCleanupSource.includes('production migration image still exists after cleanup:')
  || evidenceStart < 0
  || evidenceEnd <= evidenceStart
  || !evidenceSource.includes('if ! (set -C; : > "$partial")')
  || !evidenceSource.includes('if ! chmod 600 "$partial" "$confirmation_input"')
  || !evidenceSource.includes('if ! rm -f "$confirmation_input"')
  || !evidenceSource.includes('if ! require_root_owned_path file "$partial" 600')
  || !evidenceSource.includes('if ! mv -- "$partial" "$evidence"')
  || !evidenceSource.includes('production migration evidence staging cleanup failed')
  || evidenceSource.includes('ln "$partial" "$evidence"')
  || evidenceSource.includes('|| true')
) {
  throw new Error('production_migration_cleanup_or_evidence_guard_incomplete');
}

if (
  /test "\$after_(?:card_states|learning_records|documents|changes|auth_users)" -(?:eq|ge|gt|le|lt) /u
    .test(applySource)
  || !applySource.includes('business_row_count_observation=non_authoritative_concurrent_activity_allowed')
  || !applySource.includes('data_preservation_authority=isolated_rehearsal_preexisting_table_fingerprint')
) {
  throw new Error('production_migration_live_row_counts_must_be_non_authoritative');
}

const rollbackBlock = opsReleaseSource.match(/<<'REMOTE_ROLLBACK'\n([\s\S]*?)\nREMOTE_ROLLBACK/u)?.[1];
if (
  !rollbackBlock
  || !rollbackBlock.includes('/run/lock/icao-ops-release.lock')
  || !rollbackBlock.includes('/run/lock/icao-production-release-change.lock')
  || rollbackBlock.indexOf('/run/lock/icao-ops-release.lock')
    > rollbackBlock.indexOf('/run/lock/icao-production-release-change.lock')
) {
  throw new Error('ops_rollback_shared_release_lock_missing_or_misordered');
}

for (const releaseSource of [apiReleaseSource, opsReleaseSource]) {
  if (!releaseSource.includes('icao-production-release-change.lock')) {
    throw new Error('production_release_change_lock_missing');
  }
}
if (
  !packageSource.includes('check:production-migration')
  || !packageSource.includes('production-migration-apply-tests.mjs')
  || !packageSource.includes('production-schema-contract-tests.mjs')
  || !packageSource.includes('check-production-migration-apply.mjs')
  || !packageSource.includes('scripts/apply-production-migrations.sh')
) {
  throw new Error('production_migration_release_gate_missing');
}

console.log('Production migration apply contracts verified.');
