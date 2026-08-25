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
  'infra/ops/release-state.sh',
  'infra/ops/rollback-release.sh',
  'scripts/deploy-ops-release.sh',
  'services/api/src/config.ts',
  'services/api/src/ops-config-preflight.ts',
  'services/api/src/ops-health.controller.ts',
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
  'infra/ops/release-state.sh',
  'infra/ops/rollback-release.sh',
], { encoding: 'utf8' });
if (syntax.status !== 0) {
  throw new Error(`ops_production_shell_syntax:${syntax.stderr || syntax.stdout}`);
}

const rollbackStateTest = spawnSync('/bin/sh', [
  'infra/ops/release-state.sh',
  'self-test',
], { encoding: 'utf8' });
if (rollbackStateTest.status !== 0) {
  throw new Error(`ops_automatic_rollback_failure_state:${rollbackStateTest.stderr || rollbackStateTest.stdout}`);
}

requireText('scripts/deploy-ops-release.sh', [
  'check-mainline-release.mjs',
  'git archive --format=tar HEAD',
  'modules/icao-distribution-environment',
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
  'isolated_restore_ok',
  'select pg_database_size(current_database())',
  'required_before_build_bytes',
  'required_before_restore_bytes',
  'snapshot-checksums.sha256',
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
if (
  deployment.indexOf('release-state.sh" activate "$attempt_dir"')
    > deployment.indexOf('install -m 600 "$candidate_runtime_env" "$runtime_env"')
  || deployment.indexOf('release-state.sh" mark-deployed "$attempt_dir"')
    < deployment.indexOf('Public Ops release identity mismatch.')
) {
  throw new Error('ops_rollback_pointer_state_order_is_unsafe');
}

requireText('infra/ops/rollback-release.sh', [
  'ICAO_OPS_ROLLBACK_INTERNAL',
  '/opt/icao/runtime/releases/ops-*',
  'rollback-used',
  'runtime-env-before',
  'gateway-caddy-before',
  'previous-api-image-tag',
  'previous-release-id',
  'sha256sum -c snapshot-checksums.sha256',
  'docker compose -f "$gateway_compose" up -d --force-recreate caddy',
  'https://api.readyoufife.com/health/ready',
  'https://ops.readyoufife.com/health/ready',
  'https://ops.readyoufife.com/',
  'strict-transport-security:',
  '"service":"icao-ops-api"',
  '"database":"ok"',
  'x-icao-api-version:',
  '[ "$restored_release_id" = "$previous_release_id" ]',
  '"$state_script" consume "$attempt_dir"',
  'rollback-evidence.json',
]);

requireText('infra/ops/release-state.sh', [
  'active-rollback.tmp.$$',
  'cutover-pending',
  'mark-deployed',
  'run_automatic',
  'formal manual retry',
  'last-consumed-rollback',
  'Ops automatic rollback failure state test passed.',
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
  'ops.readyoufife.com',
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
  'corepack prepare pnpm@11.7.0 --activate',
  '--frozen-lockfile',
]);
requireText('infra/ops/Dockerfile.api', [
  'COPY modules/icao-distribution-environment modules/icao-distribution-environment',
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
  "opsCorsOrigins[0] !== 'https://ops.readyoufife.com'",
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
if (!browserApi.includes('fetch(path,')) throw new Error('ops_browser_must_use_same_origin_relative_api');

requireText('infra/ops/README.md', [
  '不会由仓库猜测',
  '只做只读 `--require-current` 检查',
  '不会把该秘密发给浏览器',
  'deployment-evidence.json',
  '回滚不逆向数据库 migration',
]);

console.log('Ops production delivery contracts verified.');
