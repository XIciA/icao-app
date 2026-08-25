import { readFile } from 'node:fs/promises';

const [
  applySource,
  migrateSource,
  rehearsalSource,
  schemaContractDataSource,
  schemaVerifierSource,
  apiReleaseSource,
  opsReleaseSource,
  packageSource,
  apiPackageSource,
] = await Promise.all([
  readFile('scripts/apply-production-migrations.sh', 'utf8'),
  readFile('services/api/scripts/migrate.mjs', 'utf8'),
  readFile('scripts/rehearse-production-migrations.sh', 'utf8'),
  readFile('services/api/scripts/production-schema-contract-data.mjs', 'utf8'),
  readFile('services/api/scripts/verify-production-schema-contract.mjs', 'utf8'),
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
  'business_rows_preserved=1',
  'auth_users_preserved=1',
  'business_rows_preservation_check=monotonic_non_decrease_not_content_fingerprint',
  'auth_users_preservation_check=monotonic_non_decrease_not_content_fingerprint',
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
const requiredSensitiveTables = [
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
  'apple_notification_events',
  'apple_revocable_credentials',
  'apple_credential_intakes',
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
for (const table of requiredSensitiveTables) {
  if (!schemaContractDataSource.includes(`'${table}'`)) {
    throw new Error(`production_schema_sensitive_table_omitted:${table}`);
  }
}
if (!schemaVerifierSource.includes('SERVER_ONLY_SENSITIVE_TABLES')) {
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
  || !evidenceSource.includes('if ! ln "$partial" "$evidence"')
  || !evidenceSource.includes('if ! rm -f "$partial"')
  || !evidenceSource.includes('if ! require_root_owned_path file "$evidence" 600')
) {
  throw new Error('production_migration_cleanup_or_evidence_guard_incomplete');
}

for (const monotonicCheck of [
  'test "$after_card_states" -ge "$before_card_states"',
  'test "$after_learning_records" -ge "$before_learning_records"',
  'test "$after_documents" -ge "$before_documents"',
  'test "$after_changes" -ge "$before_changes"',
  'test "$after_auth_users" -ge "$before_auth_users"',
]) {
  if (!applySource.includes(monotonicCheck)) {
    throw new Error(`production_migration_monotonic_check_missing:${monotonicCheck}`);
  }
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
  || !packageSource.includes('check-production-migration-apply.mjs')
  || !packageSource.includes('scripts/apply-production-migrations.sh')
) {
  throw new Error('production_migration_release_gate_missing');
}

console.log('Production migration apply contracts verified.');
