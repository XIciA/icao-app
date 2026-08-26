import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';

import {
  assertExpoPrebuildCommand,
  runReleaseCommandContractSelfTest,
} from './release-command-contract.mjs';
import { SERVER_ONLY_PUBLIC_TABLES } from '../services/api/scripts/production-schema-contract-data.mjs';

const require = createRequire(import.meta.url);
const app = JSON.parse(await readFile('app.json', 'utf8'));
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const apiPackage = JSON.parse(await readFile('services/api/package.json', 'utf8'));
const appConfig = require('../app.config.js');
const plugin = require('../plugins/with-android-release-signing');
const iosIntegrityPlugin = require('../plugins/with-ios-release-integrity');
const sample = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
        }
    }
}
`;
const first = plugin.applySigning(sample);
const second = plugin.applySigning(first);

runReleaseCommandContractSelfTest();

for (const versionPath of [
  'src/config/app-version.ts',
  'src/config/app-version.ios.ts',
  'src/config/app-version.android.ts',
]) {
  const source = await readFile(versionPath, 'utf8');
  const displayVersion = source.match(/APP_DISPLAY_VERSION\s*=\s*['"]([^'"]+)['"]/u)?.[1];
  if (displayVersion !== app.expo.version) {
    throw new Error(`${versionPath} must match the ${app.expo.version} marketing version.`);
  }
}

if (process.env.EXPO_PUBLIC_ICAO_AUDIO_E2E === '1') {
  throw new Error('The deterministic audio E2E adapter must never be enabled for Release builds.');
}

if (app.expo.name !== '听你五个' || app.expo.slug !== 'readyoufife' || app.expo.scheme !== 'readyoufife') {
  throw new Error('The formal Read You 5 name, slug, or URL scheme is inconsistent.');
}
if (app.expo.ios.bundleIdentifier !== 'com.readyoufife.ios') {
  throw new Error('The iOS Bundle ID must be com.readyoufife.ios.');
}
if (app.expo.android.package !== 'com.readyoufife.app') {
  throw new Error('The Android release package must be com.readyoufife.app.');
}
if (!app.expo.plugins.includes('./plugins/with-ios-release-integrity')) {
  throw new Error('The iOS Release integrity config plugin is missing.');
}
if (
  rootPackage.dependencies?.['react-native-iap'] !== '16.3.2' ||
  rootPackage.dependencies?.['react-native-nitro-modules'] !== '0.36.5' ||
  apiPackage.dependencies?.['@apple/app-store-server-library'] !== '3.1.0' ||
  Object.hasOwn(rootPackage.dependencies ?? {}, 'expo-native-wechat')
) {
  throw new Error('The StoreKit dependency set and WeChat runtime freeze must remain composed.');
}
const originalVariant = process.env.ICAO_APP_VARIANT;
process.env.ICAO_APP_VARIANT = 'development';
const developmentConfig = appConfig({ config: app.expo });
process.env.ICAO_APP_VARIANT = 'production';
const productionConfig = appConfig({ config: app.expo });
if (originalVariant === undefined) delete process.env.ICAO_APP_VARIANT;
else process.env.ICAO_APP_VARIANT = originalVariant;
const productionPluginNames = productionConfig.plugins.map((entry) => Array.isArray(entry) ? entry[0] : entry);
if (
  developmentConfig.ios.bundleIdentifier !== appConfig.DEVELOPMENT_IOS_BUNDLE_IDENTIFIER ||
  developmentConfig.ios.bundleIdentifier === app.expo.ios.bundleIdentifier ||
  developmentConfig.name !== '听你五个 Dev' ||
  developmentConfig.scheme !== 'readyoufife-dev'
) {
  throw new Error('The iOS Development Build must use its own app identity.');
}
if (
  productionConfig.ios.bundleIdentifier !== app.expo.ios.bundleIdentifier ||
  productionConfig.name !== app.expo.name ||
  productionConfig.scheme !== 'readyoufife' ||
  productionConfig.ios.usesAppleSignIn !== true ||
  Object.hasOwn(productionConfig.ios, 'associatedDomains') ||
  !productionPluginNames.includes('expo-apple-authentication') ||
  productionPluginNames.some((name) => /wechat|weixin/iu.test(String(name)))
) {
  throw new Error('The production app identity must remain unchanged.');
}
const iosIntegrityScript = iosIntegrityPlugin.createShellScript({
  version: app.expo.version,
  buildNumber: app.expo.ios.buildNumber,
});
const canonicalIosPlist = iosIntegrityPlugin.applyCanonicalIosUrlScheme({
  CFBundleURLTypes: [{ CFBundleURLSchemes: ['readyoufife', app.expo.ios.bundleIdentifier] }],
}, app.expo.scheme);
if (
  !iosIntegrityScript.includes('CFBundleVersion') ||
  !iosIntegrityScript.includes('_expo._tcp') ||
  !iosIntegrityScript.includes('Expo Dev Launcher') ||
  iosIntegrityPlugin.INFO_PLIST_INPUT !== '"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)"' ||
  JSON.stringify(canonicalIosPlist.CFBundleURLTypes) !== JSON.stringify([
    { CFBundleURLSchemes: ['readyoufife'] },
  ])
) {
  throw new Error('The iOS Release metadata, URL scheme, or local-network integrity gate is incomplete.');
}
const audioPlugin = app.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-audio');
if (!audioPlugin?.[1]?.microphonePermission?.includes('口语练习')) {
  throw new Error('The production microphone purpose disclosure is missing.');
}
if (first !== second) throw new Error('The Android signing config plugin must be idempotent.');
if (!/release \{\s*signingConfig signingConfigs\.release/.test(first)) {
  throw new Error('The Android release build is not connected to release signing.');
}
if (!/debug \{\s*signingConfig signingConfigs\.debug/.test(first)) {
  throw new Error('The Android debug build signing was unexpectedly changed.');
}
if (!first.includes('Missing Android release signing environment')) {
  throw new Error('The release signing environment guard is missing.');
}

const caddy = await readFile('infra/gateway/Caddyfile', 'utf8');
const aliyunSmsOverlay = await readFile('infra/supabase/docker-compose.aliyun-sms.yml', 'utf8');
const nativeAuthService = await readFile('src/features/auth/auth-service.ts', 'utf8');
const iosRelease = await readFile('scripts/release-ios.sh', 'utf8');
const iosTestFlightRelease = await readFile('scripts/release-ios-testflight.sh', 'utf8');
const iosAppStoreRelease = await readFile('scripts/release-ios-app-store.sh', 'utf8');
const androidRelease = await readFile('scripts/release-android.sh', 'utf8');
const iosStandalone = await readFile('scripts/build-standalone-ios.sh', 'utf8');
const iosTestFlightArchive = await readFile('scripts/archive-ios-testflight.sh', 'utf8');
const iosReleaseProduct = await readFile('scripts/lib/ios-release-product.sh', 'utf8');
const androidStandalone = await readFile('scripts/build-standalone-android.sh', 'utf8');
const releaseCommon = await readFile('scripts/lib/release-common.sh', 'utf8');
const wechatRuntimeFreeze = await readFile('tools/check-wechat-runtime-freeze.mjs', 'utf8');
const packageJsonSource = await readFile('package.json', 'utf8');
const iosDevelopment = await readFile('scripts/run-ios-development.sh', 'utf8');
const criticalReleaseEvidence = await readFile('tools/critical-capability-release-evidence.mjs', 'utf8');
const mainlineReleaseGuard = await readFile('tools/check-mainline-release.mjs', 'utf8');
const prepareRelease = await readFile('tools/prepare-release.mjs', 'utf8');
const contentSigningKeyTool = await readFile('tools/content-credential-signing-key.mjs', 'utf8');
const contentSigningKeyTests = await readFile('tools/content-credential-signing-key-tests.mjs', 'utf8');
const contentSigningKeyProvision = await readFile('infra/api/content-signing-key-provision.sh', 'utf8');
const contentSigningKeyProvisionTests = await readFile('tools/content-signing-key-provision-tests.mjs', 'utf8');
const apiRelease = await readFile('scripts/deploy-api-release.sh', 'utf8');
const opsRelease = await readFile('scripts/deploy-ops-release.sh', 'utf8');
const backupToolsInstaller = await readFile('scripts/install-production-backup-tools.sh', 'utf8');
const migrationRehearsal = await readFile('scripts/rehearse-production-migrations.sh', 'utf8');
const productionMigrationApply = await readFile('scripts/apply-production-migrations.sh', 'utf8');
const productionSchemaVerifier = await readFile('services/api/scripts/verify-production-schema-contract.mjs', 'utf8');
const productionSchemaContractLib = await readFile('services/api/scripts/production-schema-contract-lib.mjs', 'utf8');
const productionSchemaContractTests = await readFile('services/api/scripts/production-schema-contract-tests.mjs', 'utf8');
const clientTableGrantRevocation = await readFile(
  'services/api/drizzle/0034_revoke_client_table_grants.sql',
  'utf8',
);
const postgresBackup = await readFile('infra/backup/backup-postgres.sh', 'utf8');
const isolatedRestore = await readFile('infra/backup/restore-isolated.sh', 'utf8');
const postgresBackupService = await readFile('infra/backup/icao-postgres-backup.service', 'utf8');
const postgresReplicaService = await readFile('infra/backup/icao-postgres-replica.service', 'utf8');
const storageReplicaService = await readFile('infra/backup/icao-storage-replica.service', 'utf8');
const apiDockerfile = await readFile('infra/api/Dockerfile', 'utf8');
const opsDockerfile = await readFile('infra/ops/Dockerfile', 'utf8');
const opsApiDockerfile = await readFile('infra/ops/Dockerfile.api', 'utf8');
const apiConfig = await readFile('services/api/src/config.ts', 'utf8');
const apiConfigPreflight = await readFile('services/api/src/config-preflight.ts', 'utf8');
const apiEnvironmentExample = await readFile('services/api/.env.example', 'utf8');
const appleServerApiClient = await readFile(
  'services/api/src/commerce/apple-store-server-api-client.ts',
  'utf8',
);
const appleServerApiService = await readFile(
  'services/api/src/commerce/apple-store-server-api.service.ts',
  'utf8',
);
const appleServerReconciliation = await readFile(
  'services/api/src/commerce/apple-server-reconciliation.service.ts',
  'utf8',
);
const appleIapServerCli = await readFile('services/api/src/apple-iap-server-cli.ts', 'utf8');
const appleReconciliationTerminalMigration = await readFile(
  'services/api/drizzle/0033_medical_preak.sql',
  'utf8',
);
const apiReadme = await readFile('infra/api/README.md', 'utf8');
const apiAiRuntimeSources = (await Promise.all([
  'services/api/src/config.ts',
  'services/api/src/app.module.ts',
  'services/api/src/ai/ai.controller.ts',
  'services/api/src/ai/ai.service.ts',
  'services/api/src/ai/deepseek-review-provider.service.ts',
  'services/api/src/ai/tencent-asr.service.ts',
].map((file) => readFile(file, 'utf8')))).join('\n');
if (!caddy.includes('api.readyoufife.com') || !caddy.includes('cloud.readyoufife.com')) {
  throw new Error('The production gateway is missing the Read You 5 API or Supabase host.');
}
if (caddy.includes('api.feizhuicao.com') || caddy.includes('cloud.feizhuicao.com')) {
  throw new Error('The production gateway must not restore retired legacy API hosts.');
}
if (/download\./.test(caddy) || /file_server/.test(caddy)) {
  throw new Error('The production gateway must not expose a website or APK download host.');
}
for (const protectedAuthPath of ['/auth/v1/otp', '/auth/v1/resend', '/auth/v1/signup']) {
  if (!caddy.includes(protectedAuthPath)) {
    throw new Error(`The production gateway must block direct Native Auth start route: ${protectedAuthPath}`);
  }
}
if (
  !caddy.includes('method PUT PATCH')
  || !caddy.includes('/auth/v1/user')
  || !caddy.includes('header_up -Sb-Forwarded-For')
) {
  throw new Error('The production gateway is missing Auth mutation or forwarded-IP hardening.');
}
if (!aliyunSmsOverlay.includes('GOTRUE_SECURITY_SB_FORWARDED_FOR_ENABLED: "true"')) {
  throw new Error('The real-SMS Auth overlay must trust only the API-supplied Sb-Forwarded-For header.');
}
if (/GOTRUE_SMS_TEST_OTP|ICAO_TESTFLIGHT_SMS_TEST_OTP|SUPABASE_SMS_TEST_OTP/u.test(aliyunSmsOverlay)) {
  throw new Error('The real-SMS Auth overlay must fail closed when any fixed OTP is configured.');
}
if (
  !nativeAuthService.includes("'/v1/auth/phone/otp/start'")
  || !nativeAuthService.includes("'/v1/auth/phone/recovery/start'")
  || !nativeAuthService.includes("'/v1/account/password'")
) {
  throw new Error('Native phone OTP and password mutations must use the server-owned routes.');
}
if (!iosRelease.includes('audio-sensitive-fingerprint.mjs verify ios')) {
  throw new Error('The iOS release is missing its audio E2E fingerprint gate.');
}
if (!androidRelease.includes('audio-sensitive-fingerprint.mjs verify android')) {
  throw new Error('The Android release is missing its audio E2E fingerprint gate.');
}
if (!androidRelease.includes('critical-capability-release-evidence.mjs verify android android')) {
  throw new Error('The Android release is missing its critical-capability evidence gate.');
}
for (const [name, source] of [
  ['iOS release', iosRelease],
  ['iOS standalone', iosStandalone],
  ['TestFlight release', iosTestFlightRelease],
  ['TestFlight archive', iosTestFlightArchive],
  ['App Store handoff', iosAppStoreRelease],
  ['Android release', androidRelease],
  ['Android standalone', androidStandalone],
  ['API release', apiRelease],
  ['Ops release', opsRelease],
]) {
  if (!source.includes('check-mainline-release.mjs')) {
    throw new Error(`${name} must reject release sources outside origin/main.`);
  }
}
if (
  !mainlineReleaseGuard.includes("branch !== 'main'")
  || !mainlineReleaseGuard.includes('release_source_not_origin_main')
  || !mainlineReleaseGuard.includes("status', '--porcelain', '--untracked-files=all")
) {
  throw new Error('The shared mainline release guard is incomplete.');
}
if (
  !prepareRelease.includes('release_prepare_requires_task_branch')
  || !prepareRelease.includes("process.argv.includes('--materialize')")
  || !packageJsonSource.includes('release:materialize')
) {
  throw new Error('Version preparation must be committed before mainline release materialization.');
}
if (apiRelease.includes('ICAO_API_RELEASE_ALLOW_DIRTY')) {
  throw new Error('The API release must not retain a dirty-source escape hatch.');
}
if (
  !apiRelease.includes('.generated/release/current.json')
  || apiRelease.includes('.generated/release/current-manifest.json')
) {
  throw new Error('The API release must use materialized current release metadata.');
}
if (!apiRelease.includes('infra/api infra/backup')) {
  throw new Error('The API release archive must preserve the reviewed production backup tools.');
}
if (
  !apiRelease.includes('modules/icao-distribution-environment')
  || !migrationRehearsal.includes('modules/icao-distribution-environment')
) {
  throw new Error('API release and migration rehearsal archives must include the local distribution module.');
}
if (!packageJsonSource.includes('node --test tools/migration-rehearsal-cleanup-tests.mjs')) {
  throw new Error('The release gate must execute the migration rehearsal cleanup failure tests.');
}
if (
  !packageJsonSource.includes('pnpm check:production-migration')
  || !packageJsonSource.includes('tools/production-migration-apply-tests.mjs')
  || !packageJsonSource.includes('tools/check-production-migration-apply.mjs')
) {
  throw new Error('The release gate must execute the formal production migration apply checks.');
}
for (const [name, dockerfile] of [
  ['API', apiDockerfile],
  ['Ops Web', opsDockerfile],
  ['Ops API', opsApiDockerfile],
]) {
  if (!dockerfile.includes('COPY modules/icao-distribution-environment modules/icao-distribution-environment')) {
    throw new Error(`${name} Docker build must materialize the root local dependency before pnpm install.`);
  }
}
for (const requiredRehearsalContract of [
  'check-mainline-release.mjs',
  'icao-production-migration-rehearsal.lock',
  'database_created=0',
  'database_created=1',
  'PGPASSWORD=$POSTGRES_PASSWORD',
  'export POSTGRES_PASSWORD PGPASSWORD',
  'createdb -h db',
  '--owner=postgres "$RESTORE_DB_NAME"',
  'pg_get_userbyid(datdba)',
  "has_database_privilege('\\''postgres'\\'', datname, '\\''CONNECT'\\'')",
  "has_database_privilege('\\''postgres'\\'', datname, '\\''CREATE'\\'')",
  "has_database_privilege('\\''postgres'\\'', datname, '\\''TEMPORARY'\\'')",
  "nspname = '\\''drizzle'\\''",
  "test \"$database_contract\" = 'postgres|t|t|t|postgres'",
  'isolated_database_contract=',
  'drop_created_database',
  'database_drop_attempt=1',
  'while [ "$database_drop_attempt" -le 3 ]',
  'printf "%s\\n" "select count(*) from pg_database where datname = :',
  '-U postgres --maintenance-db=postgres --if-exists --force "$RESTORE_DB_NAME"',
  'could not remove isolated rehearsal database after 3 attempts:',
  'if ! existing=$(docker run',
  'if ! remaining=$(docker run',
  'if [ "$remaining" != 0 ]',
  'isolated_database_removed=1',
  'pg_restore -h db',
  'migration-plan.mjs --json',
  'migration-plan.mjs --require-current',
  'scripts/migrate.mjs',
  'business_rows_preserved=',
  'auth_users_preserved=',
  'table_fingerprints_before',
  'table_fingerprints_after',
  'preexisting_tables_fingerprinted=',
  'preexisting_fingerprint_mismatches=',
  'jsonb_object_agg',
  'unvalidated_constraints=',
  'device_digest_columns=',
  'expected_checksum_line=',
  'actual_checksum_line=',
  'expected_backup_checksum_line=',
  'actual_backup_checksum_line=',
  'backup=$(/bin/sh /opt/icao/runtime/backup-tools/current/backup-postgres.sh)',
  'backup_age',
  'required_bytes=',
  'available_after_restore=',
  'git archive --format=tar "$SOURCE_SHA"',
  'orphan_databases=',
  'remaining_orphans=',
  'REMOTE_CLEANUP_ARMED=1',
  'cleanup_local_resources',
  'cleanup_rehearsal_image',
  "--filter \"reference=$image\"",
  'could not inspect the existing isolated rehearsal image during cleanup:',
  'isolated rehearsal image still exists after cleanup:',
  'cleanup_verified=0',
  'cleanup_verified=1',
  'cleanup_files\ncleanup_verified=1',
  'test "$cleanup_verified" = 1',
  "printf 'cleanup_verified=%s\\n' \"$cleanup_verified\"",
  '/run/icao-migration-rehearsal-',
  'require_public_https_url ICAO_API_BUILD_NPM_REGISTRY',
  'production_migration_rehearsal_ok',
]) {
  if (!migrationRehearsal.includes(requiredRehearsalContract)) {
    throw new Error(`Production migration rehearsal contract is incomplete: ${requiredRehearsalContract}`);
  }
}
const rehearsalDropStart = migrationRehearsal.indexOf('drop_created_database() {');
const rehearsalDropEnd = migrationRehearsal.indexOf(
  '\n# BEGIN migration-rehearsal-image-cleanup',
  rehearsalDropStart,
);
const rehearsalDropFunction = migrationRehearsal.slice(rehearsalDropStart, rehearsalDropEnd);
const rehearsalImageCleanupStart = migrationRehearsal.indexOf('# BEGIN migration-rehearsal-image-cleanup');
const rehearsalImageCleanupEnd = migrationRehearsal.indexOf('# END migration-rehearsal-image-cleanup');
const rehearsalImageCleanupFunction = migrationRehearsal.slice(
  rehearsalImageCleanupStart,
  rehearsalImageCleanupEnd,
);
if (
  migrationRehearsal.includes('dropdb -h db -U supabase_admin postgres')
  || !migrationRehearsal.includes('createdb -h db -U supabase_admin --maintenance-db=postgres --owner=postgres "$RESTORE_DB_NAME"')
  || rehearsalDropStart < 0
  || rehearsalDropEnd < 0
  || rehearsalDropFunction.includes('-U supabase_admin')
  || !rehearsalDropFunction.includes('-e RESTORE_DB_NAME="$database_name"')
  || !rehearsalDropFunction.includes('--if-exists --force "$RESTORE_DB_NAME"')
  || /psql[^\n]*-v db_name="\$RESTORE_DB_NAME"[^\n]*-c/u.test(migrationRehearsal)
  || /drop_created_database[^\n]*(?:>\s*\/dev\/null|2>&1)/u.test(migrationRehearsal)
  || rehearsalImageCleanupStart < 0
  || rehearsalImageCleanupEnd < 0
  || !rehearsalImageCleanupFunction.includes("docker image ls --format '{{.Repository}}:{{.Tag}}'")
  || !rehearsalImageCleanupFunction.includes('docker image inspect "$image"')
  || !rehearsalImageCleanupFunction.includes('docker image rm "$image"')
  || rehearsalImageCleanupFunction.includes('docker image inspect "$image" >/dev/null 2>&1')
  || migrationRehearsal.indexOf('database_created=1') < migrationRehearsal.indexOf('createdb -h db')
  || !migrationRehearsal.includes('case "$database_name" in')
  || migrationRehearsal.indexOf('drop_created_database\n') > migrationRehearsal.indexOf("printf 'isolated_database_removed=1")
  || migrationRehearsal.indexOf('cleanup_verified=1') > migrationRehearsal.indexOf("printf 'cleanup_verified=%s\\n'")
  || migrationRehearsal.indexOf('cleanup_verified=1') > migrationRehearsal.indexOf("printf 'production_migration_rehearsal_ok")
) {
  throw new Error('The migration rehearsal must protect production and only drop its created isolated database.');
}
for (const requiredRehearsalSchemaContract of [
  'services/api/scripts/verify-production-schema-contract.mjs',
  '-e ICAO_PRODUCTION_DATABASE_NAME="$database_name"',
  'p.serverOnlyClientGrants !== 0',
  'p.unexpectedPublicTableOwners !== 0',
  'p.defaultAclOwners !== 1',
  'p.serverOnlyClientDefaultTableGrants !== 0',
  "printf 'schema_contract_verified=1\\n'",
  "printf 'schema_contract_sha256=%s\\n' \"$schema_contract_sha\"",
]) {
  if (!migrationRehearsal.includes(requiredRehearsalSchemaContract)) {
    throw new Error(`Migration rehearsal schema contract is incomplete: ${requiredRehearsalSchemaContract}`);
  }
}
for (const requiredApplyContract of [
  'APPLY_PRODUCTION_MIGRATIONS:',
  'ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN:-34:1:0',
  'ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN:-35:0:0',
  'scripts/rehearse-production-migrations.sh',
  'icao-production-migration-apply.lock',
  'icao-production-release-change.lock',
  'scripts/migrate.mjs --production-apply',
  'verify-production-schema-contract.mjs',
  'p.unexpectedPublicTableOwners !== 0',
  'p.defaultAclOwners !== 1',
  'p.serverOnlyClientDefaultTableGrants !== 0',
  'test "$(evidence_value schema_contract_verified)" = 1',
  'rehearsal_schema_contract_sha=$(evidence_value schema_contract_sha256)',
  'automatic_production_restore=forbidden',
  'manual_authorization_required_choose_forward_fix_or_verified_restore',
  'production_migration_apply_ok',
]) {
  if (!productionMigrationApply.includes(requiredApplyContract)) {
    throw new Error(`Formal production migration apply contract is incomplete: ${requiredApplyContract}`);
  }
}
if (
  !productionSchemaVerifier.includes('default_transaction_read_only: true')
  || !productionSchemaVerifier.includes("parsedUrl.hostname !== 'db'")
  || !productionSchemaVerifier.includes('production_schema_has_unvalidated_constraints')
  || !productionSchemaVerifier.includes("from information_schema.tables")
  || !productionSchemaVerifier.includes("table_type = 'BASE TABLE'")
  || !productionSchemaVerifier.includes('transaction.array(actualPublicTables)')
  || !productionSchemaVerifier.includes('join pg_roles owner_role on owner_role.oid = table_state.relowner')
  || !productionSchemaVerifier.includes("owner_role.rolname <> 'postgres'")
  || !productionSchemaVerifier.includes('unexpectedOwnerCount: unexpectedPublicTableOwners?.count')
  || !productionSchemaVerifier.includes('from pg_default_acl default_acl')
  || !productionSchemaVerifier.includes('aclexplode(default_acl.defaclacl)')
  || (productionSchemaVerifier.match(/owner_role\.rolname = 'postgres'/gu) ?? []).length !== 2
  || productionSchemaVerifier.includes('supabase_admin')
  || !productionSchemaVerifier.includes('privilege.grantee = 0')
  || !productionSchemaVerifier.includes("client_role.rolname in ('anon', 'authenticated')")
  || !productionSchemaContractLib.includes('production_schema_unclassified_public_tables:')
  || !productionSchemaContractLib.includes('production_schema_server_only_table_grant_present')
  || !productionSchemaContractLib.includes('production_schema_server_only_default_table_grant_present')
  || !productionSchemaContractLib.includes('production_schema_unexpected_public_table_owner')
  || !productionSchemaContractTests.includes('unexpected_public_table')
  || !productionSchemaContractTests.includes('clientGrantCount: 1')
  || !productionSchemaContractTests.includes('clientDefaultGrantCount: 1')
  || !productionSchemaContractTests.includes('unexpectedOwnerCount: 1')
  || !productionSchemaVerifier.includes('production_commerce_product_catalog_mismatch')
) {
  throw new Error('The post-migration production schema verifier is incomplete.');
}
const revokedClientTables = [...clientTableGrantRevocation.matchAll(
  /REVOKE ALL PRIVILEGES ON TABLE "public"\."([^"]+)" FROM anon, authenticated;/gu,
)].map((match) => match[1]).sort();
const defaultAclStatements = clientTableGrantRevocation.match(/ALTER DEFAULT PRIVILEGES[^;]*;/gu) ?? [];
const postgresDefaultAclRevocation = 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;';
if (
  JSON.stringify(revokedClientTables) !== JSON.stringify(SERVER_ONLY_PUBLIC_TABLES)
  || defaultAclStatements.length !== 1
  || defaultAclStatements[0] !== postgresDefaultAclRevocation
  || clientTableGrantRevocation.includes('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin')
  || clientTableGrantRevocation.includes('FROM service_role')
) {
  throw new Error('The production client-table grant revocation migration is incomplete.');
}
for (const [name, service] of [
  ['PostgreSQL backup', postgresBackupService],
  ['PostgreSQL replica', postgresReplicaService],
  ['Storage replica', storageReplicaService],
]) {
  if (
    service.includes('/opt/icao/runtime/source/')
    || !service.includes('/opt/icao/runtime/backup-tools/current/')
  ) {
    throw new Error(`${name} service must use the stable backup-tools path.`);
  }
}
for (const requiredBackupContract of [
  'check-mainline-release.mjs',
  '/opt/icao/runtime/backup-tools',
  'systemctl daemon-reload',
  'systemctl start icao-postgres-backup.service',
  'systemd-analyze verify',
  'sha256sum -c',
  'restore-isolated.sh',
  'docker exec supabase-db printenv POSTGRES_PASSWORD',
  'ICAO_BACKUP_EXPECT_USER_DATA:-1',
  'preflight_restore_verified',
  'archive_sha256=',
  'rollback()',
  'cleanup_partial() (',
  'unsupported previous backup timer state',
  'previous_timer_enabled=${previous_timer_enabled:-not-found}',
  'restored_timer_enabled=${restored_timer_enabled:-not-found}',
  'git archive --format=tar HEAD infra/backup',
  '| gzip -n',
  '$REMOTE_ROOT/uploads/',
  'openssl rand -hex 16',
  'expected_checksum_line=',
  'actual_checksum_line=',
]) {
  if (!backupToolsInstaller.includes(requiredBackupContract)) {
    throw new Error(`Production backup installer contract is incomplete: ${requiredBackupContract}`);
  }
}
if (!isolatedRestore.includes('isolated_restore_ok')) {
  throw new Error('The production backup restore check must emit isolated restore evidence.');
}
for (const restoreContract of [
  'flock -n 9',
  'RESTORE_DB_NAME',
  'created=0',
  'created=1',
  'trap cleanup_restore_database EXIT',
  'business_rows=',
  'select count(*) from auth.users',
  'select count(*) from drizzle.__drizzle_migrations',
  '-e PGPASSWORD',
]) {
  if (!isolatedRestore.includes(restoreContract)) {
    throw new Error(`The isolated restore contract is incomplete: ${restoreContract}`);
  }
}
if (isolatedRestore.includes('-e PGPASSWORD=')) {
  throw new Error('The isolated restore must not expose the database password in docker arguments.');
}
if (!isolatedRestore.includes('concurrent writes to the live database cannot invalidate') || isolatedRestore.includes('SOURCE_CARD_STATES')) {
  throw new Error('The isolated restore evidence must not compare a dump with later live counts.');
}
if (isolatedRestore.indexOf('created=1') > isolatedRestore.indexOf('trap cleanup_restore_database EXIT')) {
  throw new Error('The isolated restore cleanup must only be armed after creating its unique database.');
}
if (
  !postgresBackup.includes('flock -n 9')
  || postgresBackup.includes('trap cleanup EXIT HUP INT TERM')
  || !postgresBackup.includes("trap 'exit 1' HUP INT TERM")
  || !postgresBackup.includes('published=0')
  || !postgresBackup.includes('published=1')
) {
  throw new Error('The production backup must serialize invocations and publish dump/checksum atomically.');
}
if (backupToolsInstaller.includes('cleanup_partial() {')) {
  throw new Error('The retry cleanup must not disable fail-fast behavior in the caller shell.');
}
const cleanupFunction = backupToolsInstaller.match(/cleanup_partial\(\) \([\s\S]*?\n\)\n\nif/u)?.[0].replace(/\n\nif$/u, '');
if (!cleanupFunction) {
  throw new Error('The production backup retry cleanup function is missing.');
}
const cleanupTestRoot = await mkdtemp(`${tmpdir()}/icao-backup-cleanup-`);
try {
  const cleanupTest = spawnSync('/bin/sh', ['-c', `
set -eu
partial_dir=$CLEANUP_TEST_ROOT/partial
upload=$CLEANUP_TEST_ROOT/upload.tar.gz
checksum=$CLEANUP_TEST_ROOT/upload.tar.gz.sha256
mkdir -p "$partial_dir"
: > "$upload"
: > "$checksum"
${cleanupFunction}
cleanup_partial
false
printf 'unsafe_retry_continuation\\n'
`], {
    encoding: 'utf8',
    env: { ...process.env, CLEANUP_TEST_ROOT: cleanupTestRoot },
  });
  if (cleanupTest.status !== 1 || cleanupTest.stdout.includes('unsafe_retry_continuation')) {
    throw new Error('The backup retry cleanup disabled fail-fast behavior in its caller.');
  }
} finally {
  await rm(cleanupTestRoot, { force: true, recursive: true });
}
const archiveCommand = 'git archive --format=tar HEAD infra/backup | gzip -n';
const archiveHashes = [];
for (let attempt = 0; attempt < 2; attempt += 1) {
  if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1_100));
  const archive = spawnSync('/bin/sh', ['-c', archiveCommand], {
    cwd: process.cwd(),
    encoding: null,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (archive.status !== 0 || !archive.stdout?.length) {
    throw new Error(`The deterministic backup archive self-test failed: ${archive.stderr?.toString() ?? ''}`);
  }
  archiveHashes.push(createHash('sha256').update(archive.stdout).digest('hex'));
}
if (new Set(archiveHashes).size !== 1) {
  throw new Error('The same origin/main backup tools source produced different archive hashes.');
}
if (
  !apiRelease.includes('ICAO_API_BUILD_NPM_REGISTRY')
  || !apiRelease.includes('--build-arg "ICAO_NPM_REGISTRY=$build_npm_registry"')
  || !releaseCommon.includes('*[!A-Za-z0-9:/._~%+-]*')
  || !releaseCommon.includes('cannot be passed to a remote release command')
  || !apiDockerfile.includes('ARG ICAO_NPM_REGISTRY=')
  || !apiDockerfile.includes('COREPACK_NPM_REGISTRY="$ICAO_NPM_REGISTRY"')
  || !apiDockerfile.includes('pnpm install --registry "$ICAO_NPM_REGISTRY" --frozen-lockfile')
) {
  throw new Error('The API image build must use its explicit HTTPS registry with locked dependencies.');
}
for (const retiredReference of [
  '47.109.132.161',
  'download.feizhuicao.com',
  'ICAO_DOWNLOAD_ECS_HOST',
  'publish-android-release.sh',
  'deploy-api-release.sh',
]) {
  if (androidRelease.includes(retiredReference)) {
    throw new Error(`The Android release must not use the retired download flow: ${retiredReference}`);
  }
}
if (packageJsonSource.includes('scripts/publish-android-release.sh')) {
  throw new Error('The retired Android download-site publisher is still registered in package.json.');
}
assertExpoPrebuildCommand(iosDevelopment, {
  label: 'iOS development',
  platform: 'ios',
  requireClean: false,
  requireNoInstall: true,
});
for (const [label, source] of [
  ['iOS standalone', iosStandalone],
  ['TestFlight archive', iosTestFlightArchive],
  ['TestFlight release', iosTestFlightRelease],
]) {
  assertExpoPrebuildCommand(source, {
    label,
    platform: 'ios',
    requireClean: true,
    requireNoInstall: true,
  });
}
if (
  !iosDevelopment.includes('ICAO_APP_VARIANT=development') ||
  !iosStandalone.includes('ICAO_APP_VARIANT=production') ||
  !packageJsonSource.includes('ICAO_APP_VARIANT=development expo start --dev-client')
) {
  throw new Error('The iOS development and standalone build variants are not isolated.');
}
for (const [name, source] of [
  ['iOS Release product verifier', iosReleaseProduct],
  ['Android standalone', androidStandalone],
]) {
  for (const retiredRuntime of ['47\\.109\\.132\\.161', 'api\\.feizhuicao\\.com', 'cloud\\.feizhuicao\\.com']) {
    if (!source.includes(retiredRuntime)) {
      throw new Error(`${name} must reject retired runtime reference: ${retiredRuntime}`);
    }
  }
}
for (const retiredRuntime of ['47\\.109\\.132\\.161', '(api|cloud)\\.feizhuicao\\.com']) {
  if (!releaseCommon.includes(retiredRuntime)) {
    throw new Error(`Shared release runtime must reject retired runtime reference: ${retiredRuntime}`);
  }
}
for (const retiredPath of [
  'scripts/publish-android-release.sh',
  'infra/download-site/index.html',
  'infra/download-site/styles.css',
  'infra/download-site/release.js',
]) {
  const stillExists = await access(retiredPath).then(
    () => true,
    (error) => {
      if (error?.code === 'ENOENT') return false;
      throw error;
    },
  );
  if (stillExists) throw new Error(`Retired Android download-site source still exists: ${retiredPath}`);
}
if (!iosStandalone.includes('EXPO_PUBLIC_ICAO_AUDIO_E2E is forbidden')) {
  throw new Error('The iOS Release build is missing its deterministic-audio guard.');
}
if (
  !iosStandalone.includes('find_ios_release_app') ||
  !iosStandalone.includes('verify_ios_release_app')
) {
  throw new Error('The standalone iOS build is missing its generated-project or product integrity gate.');
}
if (
  !iosReleaseProduct.includes('configure_ios_cng_product()') ||
  !iosReleaseProduct.includes('verify_ios_storekit_dependencies()') ||
  !iosReleaseProduct.includes('verify-ios-cng-product.mjs') ||
  !iosReleaseProduct.includes('NitroIap (16.3.2)') ||
  !iosReleaseProduct.includes('NitroModules (0.36.5)') ||
  !iosReleaseProduct.includes('assert_release_plist_value CFBundleVersion') ||
  !iosReleaseProduct.includes('CFBundleURLSchemes') ||
  !iosReleaseProduct.includes('EXDevLauncher.bundle') ||
  !iosReleaseProduct.includes('_expo._tcp') ||
  !iosReleaseProduct.includes('TeamIdentifier=') ||
  !iosReleaseProduct.includes('application-identifier') ||
  !iosReleaseProduct.includes('com.apple.developer.applesignin') ||
  !iosReleaseProduct.includes('com.apple.developer.associated-domains') ||
  !iosReleaseProduct.includes('WechatOpenSDK') ||
  !iosReleaseProduct.includes('api\\.weixin\\.qq\\.com')
) {
  throw new Error('The shared iOS Release product integrity gate must compose StoreKit and no-WeChat checks.');
}
if (
  !iosTestFlightArchive.includes("-destination 'generic/platform=iOS'") ||
  !iosTestFlightArchive.includes('archivePath') ||
  !iosTestFlightArchive.includes('audio-sensitive-fingerprint.mjs verify ios') ||
  !iosTestFlightArchive.includes('verify_ios_release_app') ||
  !iosTestFlightArchive.includes('ApplicationProperties:Team') ||
  !iosTestFlightArchive.includes('check_release_runtime apple') ||
  !iosTestFlightArchive.includes('EXPO_PUBLIC_ICAO_AUDIO_E2E is forbidden') ||
  !iosTestFlightArchive.includes('check-mainline-release.mjs')
) {
  throw new Error('The TestFlight archive is missing its production identity or product integrity gate.');
}
if (
  !releaseCommon.includes('tools/check-wechat-runtime-freeze.mjs') ||
  !releaseCommon.includes('settings.external?.phone !== true') ||
  !releaseCommon.includes('settings.phone_autoconfirm === true') ||
  !releaseCommon.includes('settings.external?.[process.env.CHECK_SOCIAL_PROVIDER] !== true') ||
  !releaseCommon.includes('settings.external?.wechat === true') ||
  !releaseCommon.includes('/v1/auth/wechat/session') ||
  !releaseCommon.includes('retiredWechat.status !== 404')
) {
  throw new Error('The Release runtime gate must verify enabled providers and retired WeChat surfaces.');
}
for (const freezeContract of [
  'expo-native-wechat',
  'services/api/src/auth/wechat-auth.controller.ts',
  'services/api/src',
  'src/features/auth',
  'production_scheme_invalid',
  'associated_domains_present',
]) {
  if (!wechatRuntimeFreeze.includes(freezeContract)) {
    throw new Error(`The WeChat runtime freeze contract is incomplete: ${freezeContract}`);
  }
}
if (
  !packageJsonSource.includes('pnpm check:ios:storekit') ||
  !packageJsonSource.includes('tools/check-wechat-runtime-freeze.mjs')
) {
  throw new Error('The Release self-test must compose StoreKit and WeChat-freeze verification.');
}
if (iosTestFlightArchive.includes('ICAO_SKIP_AUDIO_E2E')) {
  throw new Error('The TestFlight archive must not allow its audio evidence gate to be bypassed.');
}
if (
  !iosTestFlightRelease.includes('critical-capability-release-evidence.mjs verify testflight ios')
  || !iosTestFlightArchive.includes('critical-capability-release-evidence.mjs verify testflight ios')
) {
  throw new Error('The TestFlight release is missing its critical-capability evidence gate.');
}
if (
  !iosAppStoreRelease.includes('critical-capability-release-evidence.mjs verify app-store ios')
  || !iosAppStoreRelease.includes('.generated/last-testflight-archive.txt')
  || !iosAppStoreRelease.includes('CFBundleVersion')
  || !iosAppStoreRelease.includes('No build was created and no upload or store submission was performed.')
) {
  throw new Error('The App Store handoff is missing its exact TestFlight build or critical-capability gate.');
}
for (const forbiddenBypass of ['skip', 'bypass', 'IGNORE_CRITICAL', 'SKIP_CRITICAL']) {
  if (criticalReleaseEvidence.includes(`--${forbiddenBypass}`) || criticalReleaseEvidence.includes(`ICAO_${forbiddenBypass}`)) {
    throw new Error(`The critical-capability gate must not expose a bypass: ${forbiddenBypass}`);
  }
}
for (const requiredContract of [
  'devRealDevice',
  'aiLive',
  'testflightRealDevice',
  'record-device-check',
  'finalize-device',
  'run-ai-live',
  'device_check_not_passed',
  'ai_live_requires_production_api',
  'ai_live_verifier_changed',
  'device_observation_digest_mismatch',
  'production_api_version_changed_after_ai_live',
  'runbooks_changed_after_acknowledgement',
  'commit_changed',
  'releaseSourceFingerprint',
  'criticalFingerprint',
  "channel === 'app-store'",
  'freshHours: 7 * 24',
  "const devEvidenceRequired = channel === 'android'",
]) {
  if (!criticalReleaseEvidence.includes(requiredContract)) {
    throw new Error(`The critical-capability evidence contract is incomplete: ${requiredContract}`);
  }
}
if (
  criticalReleaseEvidence.includes("const devEvidenceRequired = channel === 'testflight'")
  || criticalReleaseEvidence.includes('devEvidenceRequired: true')
) {
  throw new Error('TestFlight must not require Development Build real-device evidence before upload.');
}
if (
  !apiRelease.includes('migration-plan.mjs --require-current')
  || !apiRelease.includes('candidate API deployment was blocked before cutover')
  || !apiRelease.includes('config-preflight.js')
  || !apiRelease.includes('Candidate API production configuration is incomplete')
  || !apiRelease.includes('x-icao-api-version:')
) {
  throw new Error('The production API candidate must verify configuration, migration state, and release identity before cutover.');
}
if (
  !apiRelease.includes('ICAO_CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY_PATH')
  || !apiRelease.includes('content-credential-signing-key.mjs" verify')
  || apiRelease.indexOf('content-credential-signing-key.mjs" verify') > apiRelease.indexOf('load_release_runtime')
  || !apiConfig.includes('validateContentCredentialSigningKey')
  || !apiConfig.includes('timingSafeEqual(derivedPublicKey, expectedPublicKey)')
  || !apiConfig.includes("invalidConfiguration('CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY')")
) {
  throw new Error('The production API release must fail closed unless its protected Ed25519 key matches the Native public key.');
}
for (const requiredProvisioningContract of [
  'content_key_acquire_lock "$lock_file" "$expected_owner"',
  'private_directory_mode_must_be_0700',
  'private_file_mode_must_be_0600',
  'lock_file_symlink_rejected',
  'lock_file_wrong_owner',
  'lock_file_mode_must_be_0600',
  'lock_file_opened_inode_mismatch',
  'lock_parent_unsafe_mode',
  'cleanup_rejected_symlink',
  'runtime_env_invalid_or_duplicate_entry',
  'content_key_prepare_candidate_env()',
  'content_key_install_candidate_env()',
  'content_key_restore_runtime_env()',
  'content_key_rollback_release()',
  'cmp -s "$source_file" "$target_file"',
  'mv "$temporary" "$target_file"',
  'rollback_release_identity_mismatch',
  'rollback_image_identity_mismatch',
]) {
  if (!contentSigningKeyProvision.includes(requiredProvisioningContract)) {
    throw new Error(`The remote content signing-key provisioning boundary is incomplete: ${requiredProvisioningContract}`);
  }
}
for (const requiredProvisioningTest of [
  'staging is unique, private, lock-protected, and cleaned exactly',
  'staging rejects unsafe modes, links, owner mismatch, and unsafe cleanup',
  'candidate preflight failure leaves the runtime environment byte-identical and removes secrets',
  'post-cutover rollback restores image, env, compose, source, and verifies old identity',
  'rollback command failure remains a non-zero high-priority failure',
  'release URLs reject whitespace, CRLF, and remote-shell metacharacters',
  'release locks preserve existing bytes and reject links, unsafe modes, and inode mismatch',
  'staged-key cleanup failure remains before the release commit and therefore arms rollback',
  'rollback rejects a recreated container whose image digest differs from the saved digest',
  'API_RELEASE_ID=old\\r\\n',
  'DATABASE_URL=one\\nDATABASE_URL=two',
]) {
  if (!contentSigningKeyProvisionTests.includes(requiredProvisioningTest)) {
    throw new Error(`The remote content signing-key provisioning tests are incomplete: ${requiredProvisioningTest}`);
  }
}
const keyStageIndex = apiRelease.indexOf('stage "$RELEASE_ID" "$CONTENT_KEY_UPLOAD_TOKEN"');
const keyUploadIndex = apiRelease.indexOf('scp -i "$SSH_KEY" -q "$CONTENT_SIGNING_PRIVATE_KEY_PATH"');
const remoteLockIndex = apiRelease.indexOf('flock -n 9', keyUploadIndex);
const remoteStageValidationIndex = apiRelease.indexOf('content_key_validate_stage', remoteLockIndex);
const candidateEnvironmentIndex = apiRelease.indexOf('content_key_prepare_candidate_env', remoteStageValidationIndex);
const candidatePreflightIndex = apiRelease.indexOf('config-preflight.js', candidateEnvironmentIndex);
const candidateMigrationIndex = apiRelease.indexOf('migration-plan.mjs --require-current', candidatePreflightIndex);
const runtimeInstallIndex = apiRelease.indexOf('content_key_install_candidate_env', candidateMigrationIndex);
const cutoverIndex = apiRelease.indexOf('docker compose -f "$runtime_compose" up -d', runtimeInstallIndex);
const committedStageCleanupIndex = apiRelease.indexOf(
  'Failed to remove the staged content signing key before committing the API release.',
  cutoverIndex,
);
const releaseSucceededIndex = apiRelease.indexOf('release_succeeded=1', committedStageCleanupIndex);
if (
  keyStageIndex < 0
  || keyUploadIndex <= keyStageIndex
  || remoteLockIndex <= keyUploadIndex
  || remoteStageValidationIndex <= remoteLockIndex
  || candidateEnvironmentIndex <= remoteStageValidationIndex
  || candidatePreflightIndex <= candidateEnvironmentIndex
  || candidateMigrationIndex <= candidatePreflightIndex
  || runtimeInstallIndex <= candidateMigrationIndex
  || cutoverIndex <= runtimeInstallIndex
  || committedStageCleanupIndex <= cutoverIndex
  || releaseSucceededIndex <= committedStageCleanupIndex
  || !apiRelease.includes('REMOTE_CONTENT_KEY_STAGE_ARMED=1')
  || !apiRelease.includes('trap cleanup_remote_content_key_stage EXIT')
  || !apiRelease.includes('cutover_started=1')
  || !apiRelease.includes('content_key_rollback_release')
  || !apiRelease.includes('CRITICAL: the failed API cutover could not be fully rolled back and verified.')
  || !apiRelease.includes('exec 9>>"$release_lock"')
  || apiRelease.includes('exec 9>"$release_lock"')
  || !apiRelease.includes("stat -Lc '%d:%i' \"$release_lock\"")
  || !apiRelease.includes('running-image-id-before')
  || !apiRelease.includes("docker inspect -f '{{.Image}}' icao-api")
  || apiRelease.includes('-e "CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY=')
) {
  throw new Error('The API release must securely stage, preflight, install, clean, and transactionally roll back its content signing key.');
}
for (const requiredSigningKeyContract of [
  "generateKeyPairSync('ed25519')",
  'private_key_path_must_be_outside_repository',
  'private_key_parent_mode_must_be_0700',
  'private_key_mode_must_be_0600',
  'private_key_path_already_exists',
  'symlink_path_rejected',
  'constants.O_EXCL',
  'constants.O_NOFOLLOW',
  'timingSafeEqual(derived, expectedBytes)',
  'CONTENT_CREDENTIAL_PUBLIC_KEY_BASE64',
]) {
  if (!contentSigningKeyTool.includes(requiredSigningKeyContract)) {
    throw new Error(`The content signing-key boundary is incomplete: ${requiredSigningKeyContract}`);
  }
}
for (const requiredSigningKeyTest of [
  'private_key_path_must_be_outside_repository',
  'private_key_path_already_exists',
  'private_key_parent_mode_must_be_0700',
  'symlink_path_rejected',
  'private_key_does_not_match_client_public_key',
  'private_key_mode_must_be_0600',
  'private_key_must_be_ed25519',
]) {
  if (!contentSigningKeyTests.includes(requiredSigningKeyTest)) {
    throw new Error(`The content signing-key negative tests are incomplete: ${requiredSigningKeyTest}`);
  }
}
if (
  rootPackage.scripts?.['check:content-signing-key']
    !== 'node --test tools/content-credential-signing-key-tests.mjs tools/content-signing-key-provision-tests.mjs'
  || !rootPackage.scripts?.['check:release']?.includes('pnpm check:content-signing-key')
  || !rootPackage.scripts?.['check:release']?.includes('infra/api/content-signing-key-provision.sh')
  || !rootPackage.scripts?.['check:release']?.includes('pnpm check:app-store-materials')
) {
  throw new Error('The Release gate must compose content signing-key and App Store materials verification.');
}
for (const requiredAiRuntimeField of [
  'AI_TEXT_PROVIDER',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'AI_GRAMMAR_MODEL',
  'AI_POLISH_MODEL',
  'TENCENT_CLOUD_SECRET_ID',
  'TENCENT_CLOUD_SECRET_KEY',
  'TENCENT_ASR_ENDPOINT',
  'AI_ASR_STAGING_BUCKET',
]) {
  if (!apiConfig.includes(requiredAiRuntimeField)) {
    throw new Error(`The production AI runtime guard is missing: ${requiredAiRuntimeField}`);
  }
}
for (const retiredAiRuntime of ['DASHSCOPE_', 'dashscope', 'qwen', '通义千问']) {
  if (apiAiRuntimeSources.toLowerCase().includes(retiredAiRuntime.toLowerCase())) {
    throw new Error(`The production Native API still references a retired AI runtime: ${retiredAiRuntime}`);
  }
}
if (
  !apiConfig.includes("AI_TEXT_PROVIDER: z.literal('deepseek')")
  || apiAiRuntimeSources.includes("@Post('word-lookup')")
) {
  throw new Error('The production Native API must use DeepSeek text AI and local static word lookup only.');
}
if (
  !apiConfig.includes('validateProductionAiRuntime')
  || !apiConfig.includes("parsed.data.NODE_ENV === 'production'")
  || !apiConfigPreflight.includes('loadConfig()')
  || apiConfigPreflight.includes('deepseekApiKey')
  || apiConfigPreflight.includes('tencentCloudSecret')
) {
  throw new Error('The production AI configuration preflight is incomplete or unsafe.');
}
for (const appleIapServerCredential of [
  'APPLE_IAP_SERVER_ISSUER_ID',
  'APPLE_IAP_SERVER_KEY_ID',
  'APPLE_IAP_SERVER_PRIVATE_KEY',
]) {
  if (
    !apiConfig.includes(appleIapServerCredential)
    || !apiEnvironmentExample.includes(appleIapServerCredential)
  ) throw new Error(`The App Store Server API credential gate is missing: ${appleIapServerCredential}`);
}
if (
  !apiConfig.includes('APPLE_IAP_SERVER_CREDENTIAL_REUSE')
  || !apiConfig.includes('APPLE_IAP_SERVER_KEY_ID: z.string().trim().regex')
  || !apiConfigPreflight.includes('apple-app-store-server')
  || !appleServerApiClient.includes('Environment.PRODUCTION')
  || !appleServerApiClient.includes('Environment.SANDBOX')
  || !appleServerApiService.includes('ProductType.NON_RENEWABLE')
  || !appleServerApiService.includes('GetTransactionHistoryVersion.V2')
  || !appleServerApiService.includes('apple_iap_server_history_has_more_invalid')
  || !appleServerApiService.includes('mergeTransactionVersion(byTransactionId, anchor)')
  || !appleServerReconciliation.includes('apple_server_reconciliation.batch_started')
  || !appleServerReconciliation.includes('apple_server_reconciliation.batch_failed')
  || !appleServerReconciliation.includes('apple_server_reconciliation.batch_finalization_failed')
  || !appleServerReconciliation.includes('pg_advisory_xact_lock')
  || !appleServerReconciliation.includes('assertBatchEvidence')
  || !appleServerReconciliation.includes('apple_server_reconciliation_resume_state_drift')
  || !appleServerReconciliation.includes('cumulativeBatchResult')
  || !appleServerReconciliation.includes('event.sequence <= previousSequence')
  || !appleServerReconciliation.includes('sameAuditedReport')
  || !appleServerReconciliation.includes('assertPlannedReportSemantics')
  || !appleServerReconciliation.includes('assertCompletedReportSemantics')
  || !appleServerReconciliation.includes("report.applied !== (report.action !== 'none')")
  || !appleServerReconciliation.includes("case 'record_refund':")
  || !appleServerReconciliation.includes("case 'restore':")
  || !appleServerReconciliation.includes("status: 'finalization_failed'")
  || !appleServerReconciliation.includes("input.environment,\n        false")
  || !appleReconciliationTerminalMigration.includes(
    'ops_audit_events_apple_reconciliation_completed',
  )
  || !productionSchemaVerifier.includes(
    'production_apple_reconciliation_terminal_index_missing',
  )
  || !appleIapServerCli.includes('apple_iap_server_cli_requires_root')
  || !appleIapServerCli.includes('resume-batch-id')
  || !apiReadme.includes('--resume-batch-id RESUME_BATCH_ID')
  || !appleIapServerCli.includes('REQUEST_APPLE_TEST_NOTIFICATION_PRODUCTION')
  || !appleIapServerCli.includes('APPLY_APPLE_RECONCILIATION_PRODUCTION')
) {
  throw new Error('The App Store Server API reconciliation or readiness gate is incomplete.');
}
for (const forbiddenEvidencePath of ['import-ai-live', 'function deviceChecks()']) {
  if (criticalReleaseEvidence.includes(forbiddenEvidencePath)) {
    throw new Error(`The critical-capability gate exposes a forgeable evidence path: ${forbiddenEvidencePath}`);
  }
}
if (!androidStandalone.includes('EXPO_PUBLIC_ICAO_AUDIO_E2E is forbidden')) {
  throw new Error('The Android Release build is missing its deterministic-audio guard.');
}

console.log('release configuration verified');
