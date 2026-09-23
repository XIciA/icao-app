import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files = Object.fromEntries(await Promise.all([
  'apps/ops/src/api.ts',
  'infra/gateway/Caddyfile',
  'infra/gateway/docker-compose.yml',
  'infra/ops/Dockerfile',
  'infra/ops/Dockerfile.api',
  'infra/ops/README.md',
  'infra/ops/docker-compose.runtime.yml',
  'infra/ops/gateway.env.example',
  'infra/ops/ops-api.env.example',
  'infra/ops/cleanup-ops-uploads.sh',
  'infra/ops/postgres-password.sh',
  'infra/ops/release-state.sh',
  'infra/ops/rollback-release.sh',
  'infra/ops/verify-ops-absence.sh',
  'scripts/deploy-ops-release.sh',
  'services/api/src/config.ts',
  'services/api/src/admin/admin-provisioning.ts',
  'services/api/src/ops-config-preflight.ts',
  'services/api/src/ops-health.controller.ts',
  'services/api/scripts/provision-ops-staff.ts',
  'services/api/scripts/ops-production-readiness-lib.mjs',
  'services/api/scripts/verify-ops-production-readiness.mjs',
].map(async (path) => [path, await readFile(path, 'utf8')])));

function requireText(path, markers) {
  for (const marker of markers) {
    if (!files[path].includes(marker)) throw new Error(`${path}:missing:${marker}`);
  }
}

function forbidText(path, markers) {
  for (const marker of markers) {
    if (files[path].includes(marker)) throw new Error(`${path}:forbidden:${marker}`);
  }
}

for (const retiredDraft of [
  'infra/ops/docker-compose.draft.yml',
  'infra/ops/gateway.Caddyfile.example',
]) {
  const exists = await access(retiredDraft).then(() => true, (error) => {
    if (error?.code === 'ENOENT') return false;
    throw error;
  });
  if (exists) throw new Error(`ops_production_retired_draft_exists:${retiredDraft}`);
}

const syntax = spawnSync('/bin/sh', [
  '-n',
  'scripts/deploy-ops-release.sh',
  'infra/ops/cleanup-ops-uploads.sh',
  'infra/ops/postgres-password.sh',
  'infra/ops/release-state.sh',
  'infra/ops/rollback-release.sh',
  'infra/ops/verify-ops-absence.sh',
], { encoding: 'utf8' });
if (syntax.status !== 0) {
  throw new Error(`ops_production_shell_syntax:${syntax.stderr || syntax.stdout}`);
}

const gatewayScopeTest = spawnSync('python3', ['infra/ops/test_prepare_gateway.py'], { encoding: 'utf8' });
if (gatewayScopeTest.status !== 0) {
  throw new Error(`ops_gateway_scope:${gatewayScopeTest.stderr || gatewayScopeTest.stdout}`);
}

const rollbackStateTest = spawnSync('/bin/sh', [
  'infra/ops/release-state.sh',
  'self-test',
], { encoding: 'utf8' });
if (rollbackStateTest.status !== 0) {
  throw new Error(`ops_automatic_rollback_failure_state:${rollbackStateTest.stderr || rollbackStateTest.stdout}`);
}
for (const [name, script] of [
  ['first_deployment_absence', 'infra/ops/verify-ops-absence.sh'],
  ['locked_upload_janitor', 'infra/ops/cleanup-ops-uploads.sh'],
]) {
  const result = spawnSync('/bin/sh', [script, 'self-test'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ops_${name}_self_test:${result.stderr || result.stdout}`);
  }
}
const postgresPasswordTest = spawnSync('/bin/sh', [
  'infra/ops/postgres-password.sh',
], {
  encoding: 'utf8',
  env: { ...process.env, ICAO_OPS_POSTGRES_PASSWORD_SELF_TEST: '1' },
});
if (postgresPasswordTest.status !== 0) {
  throw new Error(`ops_postgres_password_lifecycle_self_test:${postgresPasswordTest.stderr || postgresPasswordTest.stdout}`);
}
const uploadStagingTest = spawnSync(process.execPath, [
  'tools/test-ops-upload-staging.mjs',
], { encoding: 'utf8' });
if (uploadStagingTest.status !== 0) {
  throw new Error(`ops_upload_staging_real_caller_test:${uploadStagingTest.stderr || uploadStagingTest.stdout}`);
}

requireText('services/api/scripts/provision-ops-staff.ts', [
  'runOpsStaffProvision().then(',
  "process.stderr.write('ops_staff_provision_failed\\n')",
  'process.exitCode = 1',
]);
forbidText('services/api/scripts/provision-ops-staff.ts', [
  'await runOpsStaffProvision()',
]);
requireText('services/api/src/admin/admin-provisioning.ts', [
  'insert into ops_staff_recovery_codes',
  "transaction(recoveryRows, 'id', 'staff_id', 'code_hash')",
]);
forbidText('services/api/src/admin/admin-provisioning.ts', [
  'insert into ops_staff_recovery_codes (id, staff_id, code_hash)',
]);

requireText('scripts/deploy-ops-release.sh', [
  'check-mainline-release.mjs',
  'git archive --format=tar HEAD',
  'modules/icao-distribution-environment',
  'modules/icao-wechat-auth',
  '| gzip -n',
  'ICAO_OPS_PRODUCTION_CONFIRM',
  'ICAO_OPS_EXPECTED_PUBLIC_IP',
  'root-owned regular file with mode 0600',
  'does not match the production allowlist',
  'The gateway environment must contain only the Ops proxy secret.',
  'OPS_TRUSTED_PROXY_SHARED_SECRET',
  'https://api.readyoufife.com/v1/admin/health',
  'migration-plan.mjs --require-current',
  'verify-ops-production-readiness.mjs',
  'At least one non-disabled Ops administrator is required before cutover.',
  'ops-config-preflight.js',
  'backup-postgres.sh',
  'restore-isolated.sh',
  'postgres-password.sh',
  'load_ops_postgres_password',
  'clear_ops_postgres_password',
  'isolated_restore_ok',
  'select pg_database_size(current_database())',
  'required_before_build_bytes',
  'required_before_restore_bytes',
  'snapshot-checksums.sha256',
  'release-state.sh" snapshot-previous "$attempt_dir"',
  'release-state.sh" activate "$attempt_dir"',
  'release-state.sh" mark-deployed "$attempt_dir"',
  'rollback-release.sh',
  'automatic',
  'ICAO_OPS_ROLLBACK_CONFIRM',
  'deployment-evidence.json',
  'publicTlsAndHealth',
  'ordinaryApiIsolation',
  '127.0.0.1:3102',
  '127.0.0.1:4180',
  'cleanup-ops-uploads.sh" cleanup',
  "<<'REMOTE_STAGE'",
  'validate_release_root',
  'mkdir -m 700 "$stage_dir"',
  'check_private_directory "$upload_root" && check_private_directory "$upload_dir"',
]);
forbidText('scripts/deploy-ops-release.sh', [
  'migration:apply',
  'scripts/migrate.mjs',
  'vercel ',
  'edgeone deploy',
  'git add',
  'git push',
  'ops:staff:provision',
  'provision-ops-staff',
  'insert into ops_staff_accounts',
]);
const deployment = files['scripts/deploy-ops-release.sh'];
const stagingBlock = deployment.match(/<<'REMOTE_STAGE'\n([\s\S]*?)\nREMOTE_STAGE/u)?.[1];
if (!stagingBlock) throw new Error('ops_upload_staging_preflight_missing');
const stagingWrite = stagingBlock.indexOf('exec 9>"$lock_file"');
const stagingReadOnlyPreflight = stagingBlock.slice(0, stagingWrite);
if (
  stagingWrite < 0
  || !stagingReadOnlyPreflight.includes('\nvalidate_release_root\n')
  || !stagingReadOnlyPreflight.includes('validate_private_dir "$upload_root"')
  || deployment.indexOf("<<'REMOTE_STAGE'") > deployment.indexOf('scp -i "$SSH_KEY" -q "$archive"')
  || deployment.includes('"install -d -m 700 \'$remote_upload_root\'"')
) {
  throw new Error('ops_upload_staging_must_read_only_validate_boundaries_before_any_remote_write');
}
if (
  deployment.indexOf('release-state.sh" activate "$attempt_dir"')
    > deployment.indexOf('install -m 600 "$candidate_runtime_env" "$runtime_env"')
  || deployment.indexOf('release-state.sh" mark-deployed "$attempt_dir"')
    < deployment.indexOf('Public Ops release identity mismatch.')
) {
  throw new Error('ops_rollback_pointer_state_order_is_unsafe');
}
if (
  deployment.indexOf('load_ops_postgres_password')
    > deployment.indexOf('/bin/sh "$restore_script" "$backup_path"')
  || deployment.indexOf('clear_ops_postgres_password')
    < deployment.indexOf('/bin/sh "$restore_script" "$backup_path"')
) {
  throw new Error('ops_isolated_restore_postgres_password_lifecycle_is_unsafe');
}
if (
  deployment.indexOf('cleanup-ops-uploads.sh" cleanup') < deployment.lastIndexOf('if ! flock -n 9; then')
  || deployment.indexOf('cleanup-ops-uploads.sh" cleanup')
    < deployment.indexOf('mv "$partial_release" "$release_dir"')
) {
  throw new Error('ops_upload_janitor_must_run_only_after_the_remote_lock_and_source_validation');
}

requireText('infra/ops/rollback-release.sh', [
  'ICAO_OPS_ROLLBACK_INTERNAL',
  '/opt/icao/runtime/releases/ops-*',
  'rollback-used',
  'runtime-env-before',
  'gateway-caddy-before',
  'previous-api-image-tag',
  'previous-release-id',
  'previous-active-attempt',
  'sha256sum -c snapshot-checksums.sha256',
  'docker compose -f "$gateway_compose" up -d --force-recreate caddy',
  'https://api.readyoufife.com/health/ready',
  'https://api.readyoufife.com/admin/health/ready',
  'https://api.readyoufife.com/admin/',
  'strict-transport-security:',
  '"service":"icao-ops-api"',
  '"database":"ok"',
  'x-icao-api-version:',
  '[ "$restored_release_id" = "$previous_release_id" ]',
  '"$state_script" consume "$attempt_dir"',
  '"$absence_script" verify',
  '"opsContainersAbsent": "verified"',
  '"publicOpsAbsent": "verified"',
  'rollback-evidence.json',
]);

requireText('infra/ops/release-state.sh', [
  'ops-active-rollback.tmp.$$',
  'previous-active-attempt',
  'snapshot_previous',
  'cutover-pending',
  'mark-deployed',
  'run_automatic',
  'formal manual retry',
  'attempt-scoped consumption identities',
  'global rollback owner that did not match the running release',
  'stale release retained manual rollback ownership',
  'Ops global rollback ownership and same-release retry tests passed.',
]);
forbidText('infra/ops/release-state.sh', ['last-consumed-rollback']);

requireText('infra/ops/verify-ops-absence.sh', [
  'docker inspect icao-ops-api',
  'docker inspect icao-ops-web',
  'curl -sS --max-time 5',
  'https://api.readyoufife.com/admin/',
  'https://api.readyoufife.com/admin/health/ready',
  'consecutive_absent',
  'accepted a surviving Ops container',
  'accepted a surviving public Ops host',
]);
forbidText('infra/ops/verify-ops-absence.sh', ['curl -fsS']);

requireText('infra/ops/cleanup-ops-uploads.sh', [
  'ICAO_OPS_UPLOAD_JANITOR_LOCK_HELD',
  '[ "$candidate" != "$current_stage" ]',
  '[ "$age" -ge 86400 ]',
  'refuses non-regular, linked, or insecure upload files',
  'ran without the held-lock guard',
  'preserve current/recent stages or remove a stale stage',
  'validate_private_dir "$upload_root" "$expected_owner"',
  'accepted a symbolic-link upload root',
]);

requireText('infra/ops/postgres-password.sh', [
  'unset POSTGRES_PASSWORD',
  'POSTGRES_PASSWORD=$(docker exec supabase-db printenv POSTGRES_PASSWORD)',
  '[ -z "$POSTGRES_PASSWORD" ]',
  'export POSTGRES_PASSWORD',
  'clear_ops_postgres_password',
  'FAKE_POSTGRES_PASSWORD_RESULT=success',
  'for result in failure empty',
  'Ops PostgreSQL password lifecycle tests passed.',
]);
forbidText('scripts/deploy-ops-release.sh', [
  '-e POSTGRES_PASSWORD=',
  'echo "$POSTGRES_PASSWORD"',
  'printf "$POSTGRES_PASSWORD"',
]);

requireText('services/api/scripts/verify-ops-production-readiness.mjs', [
  'default_transaction_read_only: true',
  "client.begin('read only'",
  'from ops_staff_accounts',
  "where role = 'admin' and disabled_at is null",
  'activeAdminCount',
]);
forbidText('services/api/scripts/verify-ops-production-readiness.mjs', [
  'insert into',
  'update ops_staff_accounts',
  'delete from ops_staff_accounts',
]);

requireText('infra/ops/docker-compose.runtime.yml', [
  'image: icao-ops-api:production',
  'image: icao-ops-web:production',
  '127.0.0.1:3102:3102',
  '127.0.0.1:4180:8080',
  '/opt/icao/runtime/ops-api/.env',
  'read_only: true',
  'no-new-privileges:true',
  'cap_drop:',
  'name: supabase_default',
]);
forbidText('infra/ops/docker-compose.runtime.yml', ['build:', '0.0.0.0:3102', '0.0.0.0:4180']);

requireText('infra/gateway/Caddyfile', [
  'handle_path /admin/* {',
  'redir /admin /admin/ 308',
  '@ops_health path /health/live /health/ready',
  '@ops_admin path /v1/admin/*',
  'reverse_proxy 127.0.0.1:3102',
  'reverse_proxy 127.0.0.1:4180',
  'header_up -X-Ops-Client-IP',
  'header_up -X-Ops-Proxy-Secret',
  'header_up X-Ops-Client-IP {remote_host}',
  'header_up X-Ops-Proxy-Secret {$OPS_TRUSTED_PROXY_SHARED_SECRET}',
  'Cache-Control "no-store"',
]);
const gateway = files['infra/gateway/Caddyfile'];
if (gateway.indexOf('@ops_admin') > gateway.lastIndexOf('\thandle {')) {
  throw new Error('ops_gateway_admin_route_must_precede_static_fallback');
}
requireText('infra/gateway/docker-compose.yml', ['/opt/icao/runtime/gateway/.env']);

requireText('infra/ops/Dockerfile', [
  'caddy:2.11.4-alpine',
  'COPY modules/icao-distribution-environment modules/icao-distribution-environment',
  'COPY modules/icao-wechat-auth modules/icao-wechat-auth',
  'corepack prepare pnpm@11.7.0 --activate',
  '--frozen-lockfile',
]);
requireText('infra/ops/Dockerfile.api', [
  'COPY modules/icao-distribution-environment modules/icao-distribution-environment',
  'COPY modules/icao-wechat-auth modules/icao-wechat-auth',
  'USER node',
  'build:ops',
]);

const expectedOpsEnvKeys = [
  'DATABASE_URL',
  'NODE_ENV',
  'API_RELEASE_ID',
  'ACCOUNT_IDENTITY_HASH_SECRET',
  'OPS_ENABLED',
  'OPS_HOST',
  'OPS_PORT',
  'OPS_CORS_ORIGINS',
  'OPS_SESSION_HASH_SECRET',
  'OPS_TOTP_ENCRYPTION_KEY',
  'OPS_TRUSTED_PROXY_SHARED_SECRET',
];
const exampleOpsEnvKeys = files['infra/ops/ops-api.env.example']
  .split('\n')
  .filter((line) => /^[A-Z0-9_]+=/u.test(line))
  .map((line) => line.slice(0, line.indexOf('=')));
if (JSON.stringify(exampleOpsEnvKeys) !== JSON.stringify(expectedOpsEnvKeys)) {
  throw new Error('ops_api_environment_example_allowlist_mismatch');
}
const gatewayEnvKeys = files['infra/ops/gateway.env.example']
  .split('\n')
  .filter((line) => /^[A-Z0-9_]+=/u.test(line))
  .map((line) => line.slice(0, line.indexOf('=')));
if (JSON.stringify(gatewayEnvKeys) !== JSON.stringify(['OPS_TRUSTED_PROXY_SHARED_SECRET'])) {
  throw new Error('ops_gateway_environment_example_allowlist_mismatch');
}

requireText('services/api/src/config.ts', [
  "opsCorsOrigins[0] !== 'https://api.readyoufife.com'",
  "invalid_ops_api_configuration:API_RELEASE_ID",
  "invalid_ops_api_configuration:OPS_CORS_ORIGINS",
]);
requireText('services/api/src/ops-config-preflight.ts', [
  "config.nodeEnv !== 'production'",
  "config.opsHost !== '0.0.0.0'",
  'config.opsPort !== 3102',
]);
requireText('services/api/src/ops-health.controller.ts', [
  "reply.header('x-icao-api-version', this.config.apiReleaseId)",
  "ServiceUnavailableException('database_unavailable')",
]);

const browserApi = files['apps/ops/src/api.ts'];
for (const forbiddenBrowserMarker of [
  'DATABASE_URL',
  'postgresql://',
  'OPS_TRUSTED_PROXY_SHARED_SECRET',
  'createClient(',
]) {
  if (browserApi.includes(forbiddenBrowserMarker)) {
    throw new Error(`ops_browser_database_or_secret_boundary:${forbiddenBrowserMarker}`);
  }
}
if (!browserApi.includes("location.pathname.startsWith('/admin/') ? '/admin' : ''")) throw new Error('ops_browser_must_use_same_origin_relative_api');

requireText('infra/ops/README.md', [
  '不会由仓库猜测',
  '只做只读 `--require-current` 检查',
  '不会把该秘密发给浏览器',
  'deployment-evidence.json',
  '回滚不逆向数据库 migration',
]);

console.log('Ops production delivery contracts verified.');
