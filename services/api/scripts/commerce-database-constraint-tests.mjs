import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, createHmac, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test, { after, before } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { exportJWK, SignJWT } from 'jose';

import { RecentAuthService } from '../src/auth/recent-auth.service.ts';
import { PhoneAuthService } from '../src/auth/phone-auth.service.ts';
import { PhoneSecurityRetentionService } from '../src/auth/phone-security-retention.service.ts';
import { SmsDeliveryAuthority } from '../src/auth/sms/sms-delivery-authority.ts';
import { AppleAuthHttpError } from '../src/auth/apple-auth-http.ts';
import { AppleAuthService } from '../src/auth/apple-auth.service.ts';
import { IdentityDigestService } from '../src/account/identity-digest.service.ts';
import { AccountIdentityService } from '../src/account/account-identity.service.ts';
import { AccountDeletionService } from '../src/account/account-deletion.service.ts';
import { PersistentCommerceBenefitsService } from '../src/commerce/persistent-commerce-benefits.service.ts';
import { CommerceService } from '../src/commerce/commerce.service.ts';
import { JoseAppleIdTokenVerifier } from '../src/auth/apple-id-token.verifier.ts';
import * as databaseSchema from '../src/database/schema.ts';

const migrationsDirectory = fileURLToPath(new URL('../drizzle', import.meta.url));
const clusterRoot = mkdtempSync(join(tmpdir(), 'icao-commerce-postgres-'));
const dataDirectory = join(clusterRoot, 'data');
const socketDirectory = join(clusterRoot, 'socket');
let port;
let serviceDatabaseClient;
let serviceDatabase;

function requireBinary(name) {
  const result = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
  assert.equal(result.status, 0, `missing_required_postgres_binary:${name}`);
  return result.stdout.trim();
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const selectedPort = address.port;
      server.close((error) => (error ? reject(error) : resolve(selectedPort)));
    });
  });
}

function psql(input) {
  return spawnSync(requireBinary('psql'), [
    '-X',
    '-q',
    '-v',
    'ON_ERROR_STOP=1',
    '-h',
    socketDirectory,
    '-p',
    String(port),
    '-U',
    'postgres',
    '-d',
    'postgres',
  ], {
    input,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });
}

function queryScalar(sql) {
  return execFileSync(requireBinary('psql'), [
    '-X',
    '-qAt',
    '-h',
    socketDirectory,
    '-p',
    String(port),
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-c',
    sql,
  ], { encoding: 'utf8' }).trim();
}

function trialMergeTransaction({
  creditBatchId,
  creditPoints,
  label,
  sourceAccountId,
  sourceBatchId,
  sourceConsumed,
  sourceReservationId,
  targetAccountId,
  targetBatchId,
  targetConsumed,
  targetReservationId,
}) {
  const operationId = `trial-merge:${targetAccountId}:${sourceAccountId}`;
  const settlementRows = [
    { batchId: targetBatchId, consumed: targetConsumed, reservationId: targetReservationId },
    { batchId: sourceBatchId, consumed: sourceConsumed, reservationId: sourceReservationId },
  ].filter(({ consumed }) => consumed > 0);
  const reservations = settlementRows.length === 0 ? '' : `
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES
      ${settlementRows.map(({ consumed, reservationId }, index) => `('${reservationId}', 'production', '${targetAccountId}', '${label}-settle-${index}', 'transcription', 'ai-points-v1', ${consumed}, 'reserved')`).join(',\n      ')};
    INSERT INTO ai_point_reservation_allocations (
      environment, account_id, reservation_id, batch_id, points
    ) VALUES
      ${settlementRows.map(({ batchId, consumed, reservationId }) => `('production', '${targetAccountId}', '${reservationId}', '${batchId}', ${consumed})`).join(',\n      ')};
    UPDATE ai_point_reservations
    SET status = 'settled', settled_at = now()
    WHERE id IN (${settlementRows.map(({ reservationId }) => `'${reservationId}'`).join(', ')});
  `;
  return `
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, reserved_points, available_at, status
    ) VALUES
      ('${targetBatchId}', 'production', '${targetAccountId}', '${targetAccountId}', 'trial',
       '${label}-target', 'ai-points-v1', 0, 100, ${targetConsumed}, now(), 'available'),
      ('${sourceBatchId}', 'production', '${targetAccountId}', '${sourceAccountId}', 'trial',
       '${label}-source', 'ai-points-v1', 0, 100, ${sourceConsumed}, now(), 'available');
    ${reservations}
    UPDATE ai_point_batches
    SET status = 'merged', reserved_points = 0,
        consumed_points = CASE id
          WHEN '${targetBatchId}' THEN ${targetConsumed}
          ELSE ${sourceConsumed}
        END
    WHERE id IN ('${targetBatchId}', '${sourceBatchId}');
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, consumed_points, available_at, status
    ) VALUES (
      '${creditBatchId}', 'production', '${targetAccountId}', '${targetAccountId}', 'trial',
      'merge:${targetAccountId}:${sourceAccountId}', 'ai-points-v1', 0, 100,
      ${100 - creditPoints}, now(), 'available'
    );
    INSERT INTO ai_point_ledger_entries (
      environment, account_id, batch_id, operation_id, entry_type, direction, points
    ) VALUES
      ('production', '${targetAccountId}', '${targetBatchId}', '${operationId}',
       'merge_debit', 'debit', ${100 - targetConsumed}),
      ('production', '${targetAccountId}', '${sourceBatchId}', '${operationId}',
       'merge_debit', 'debit', ${100 - sourceConsumed}),
      ('production', '${targetAccountId}', '${creditBatchId}', '${operationId}',
       'merge_credit', 'credit', ${creditPoints});
    COMMIT;
  `;
}

before(async () => {
  port = await availablePort();
  mkdirSync(socketDirectory);
  const initdb = requireBinary('initdb');
  const pgCtl = requireBinary('pg_ctl');
  execFileSync(initdb, ['-D', dataDirectory, '-A', 'trust', '-U', 'postgres', '--no-locale'], {
    stdio: 'ignore',
  });
  execFileSync(pgCtl, [
    '-D',
    dataDirectory,
    '-o',
    `-F -k ${socketDirectory} -p ${port}`,
    '-w',
    'start',
  ], { stdio: 'ignore' });
  const bootstrap = psql(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL);
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      public boolean NOT NULL,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
  `);
  assert.equal(bootstrap.status, 0, bootstrap.stderr);
  assert.ok(existsSync(migrationsDirectory));
  const cumulativeMigration = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(migrationsDirectory, name), 'utf8'))
    .join('\n')
    .replaceAll('--> statement-breakpoint', '');
  const migration = psql(cumulativeMigration);
  assert.equal(migration.status, 0, migration.stderr);
  serviceDatabaseClient = postgres({
    database: 'postgres',
    host: socketDirectory,
    max: 2,
    port,
    username: 'postgres',
  });
  serviceDatabase = drizzle(serviceDatabaseClient, { schema: databaseSchema });
});

after(async () => {
  await serviceDatabaseClient?.end({ timeout: 5 });
  const pgCtl = requireBinary('pg_ctl');
  spawnSync(pgCtl, ['-D', dataDirectory, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  rmSync(clusterRoot, { recursive: true, force: true });
});

function authSession({
  accountId = '40000000-0000-4000-8000-000000000001',
  authUserId = '40000000-0000-4000-8000-000000000002',
  sessionId = '40000000-0000-4000-8000-000000000003',
} = {}) {
  return {
    accessToken: 'not-a-real-token',
    authenticationMethods: [],
    authUserId,
    identities: [],
    issuedAt: Math.floor(Date.now() / 1_000),
    passwordSet: true,
    sessionId,
    user: {
      id: accountId,
      authUserId,
      phone: '+8613800000000',
      providers: ['phone'],
    },
  };
}

function recentAuthService(passwordVerifier = { verify: async () => undefined }) {
  return new RecentAuthService(
    { accountIdentityHashSecret: 'recent-auth-integration-secret-32-bytes' },
    { db: serviceDatabase },
    passwordVerifier,
  );
}

const applePrivateKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey
  .export({ format: 'pem', type: 'pkcs8' }).toString();

function appleConfig(overrides = {}) {
  return {
    accountIdentityHashSecret: 'stable-account-identity-owner-secret-32-bytes',
    identityBenefitDigestKeyVersion: 2,
    identityBenefitDigestPreviousKeys: [{ secret: 'previous-identity-digest-secret-32-bytes', version: 1 }],
    identityBenefitDigestSecret: 'current-identity-digest-secret-32-bytes',
    appleCredentialEncryptionKey: Buffer.alloc(32, 7).toString('base64'),
    appleKeyId: 'TESTKEY001',
    applePrivateKey,
    appleSignInClientId: 'com.feizhuicao.app',
    appleTeamId: 'TESTTEAM01',
    ...overrides,
  };
}

function smsAuthorityConfig(overrides = {}) {
  return appleConfig({
    sms: {
      aliyunEndpoint: 'dysmsapi.aliyuncs.com',
      aliyunSignName: '云启航科成都',
      dailyLimit: 200,
      legalEntityName: '云启航科（成都）科技有限公司',
      monthlyLimit: 2_000,
      phoneDailyLimit: 10,
      phoneHourlyLimit: 5,
      provider: 'aliyun',
      ...overrides,
    },
  });
}

function appleSession({
  accountId = '50000000-0000-4000-8000-000000000001',
  authUserId = '50000000-0000-4000-8000-000000000002',
  sessionId = '50000000-0000-4000-8000-000000000003',
  subject = 'apple-subject-1',
} = {}) {
  const account = psql(`INSERT INTO accounts (id) VALUES ('${accountId}') ON CONFLICT (id) DO NOTHING;`);
  assert.equal(account.status, 0, account.stderr);
  return {
    ...authSession({ accountId, authUserId, sessionId }),
    identities: [{ provider: 'apple', subject }],
    user: { id: accountId, authUserId, providers: ['apple'] },
  };
}

function appleIdToken({ audience = 'com.feizhuicao.app', expiresAt, nonce, subject }) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'apple-test' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    aud: audience,
    exp: expiresAt ?? Math.floor(Date.now() / 1_000) + 300,
    iss: 'https://appleid.apple.com',
    nonce: createHash('sha256').update(nonce).digest('hex'),
    sub: subject,
  })).toString('base64url');
  return `${header}.${payload}.test-signature`;
}

function appleService(http, config = appleConfig(), verifier = undefined) {
  return new AppleAuthService(
    config,
    http,
    verifier ?? {
      verify: async (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')),
    },
    { db: serviceDatabase },
    new IdentityDigestService(config),
  );
}

async function deletionAccount({ accountId, phone, sessionId }) {
  const authSetup = psql(`
    INSERT INTO auth.users (id) VALUES ('${accountId}');
    INSERT INTO auth.sessions (id, user_id) VALUES ('${sessionId}', '${accountId}');
  `);
  assert.equal(authSetup.status, 0, authSetup.stderr);
  const source = {
    ...authSession({ accountId, authUserId: accountId, sessionId }),
    user: { id: accountId, phone },
  };
  await new AccountIdentityService(appleConfig(), { db: serviceDatabase }).resolve(source);
  return source;
}

function deletionService({
  appleAuth = { revokeForAccount: async () => ({ outcome: 'revoked' }) },
  authAdmin = { deleteUser: async () => undefined },
  feedback = { removeObjects: async () => undefined },
} = {}) {
  const recentAuth = recentAuthService();
  return {
    recentAuth,
    service: new AccountDeletionService(
      appleConfig(),
      authAdmin,
      appleAuth,
      new PersistentCommerceBenefitsService(),
      { db: serviceDatabase },
      feedback,
      recentAuth,
    ),
  };
}

test('the cumulative migration enables RLS on all 45 public tables', () => {
  assert.equal(
    queryScalar(`
      SELECT COUNT(*)::text || ':' || COUNT(*) FILTER (WHERE relrowsecurity)::text
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
    `),
    '45:45',
  );
});

test('account-security authority tables are private to the API database role', () => {
  const protectedTables = [
    'account_content_credential_revocations',
    'account_deletion_auth_users',
    'account_deletion_jobs',
    'account_deletion_status_rate_limits',
    'account_deletion_tombstones',
    'account_security_events',
    'apple_revocable_credentials',
    'apple_credential_intakes',
    'lifetime_identity_benefit_claims',
    'phone_otp_intents',
    'recent_auth_challenges',
    'recent_auth_grants',
    'sms_delivery_attempts',
    'sms_usage_counters',
  ];
  for (const role of ['anon', 'authenticated']) {
    for (const table of protectedTables) {
      assert.equal(
        queryScalar(`SELECT has_table_privilege('${role}', '${table}', 'SELECT,INSERT,UPDATE,DELETE')::text`),
        'false',
        `${role} must not access ${table}`,
      );
    }
  }
});

test('lifetime identity claims survive account deletion and remain globally single-use', () => {
  const first = psql(`
    INSERT INTO lifetime_identity_benefit_claims (
      benefit_key, identity_digest, provider, claim_context_digest
    ) VALUES ('trial-100-v1', 'identity-digest-1', 'phone', 'account-context-1');
  `);
  assert.equal(first.status, 0, first.stderr);

  const duplicate = psql(`
    INSERT INTO lifetime_identity_benefit_claims (
      benefit_key, identity_digest, provider, claim_context_digest
    ) VALUES ('trial-100-v1', 'identity-digest-1', 'phone', 'account-context-2');
  `);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /lifetime_identity_benefit_claims.*pk/);
  assert.equal(
    queryScalar(`SELECT claim_context_digest FROM lifetime_identity_benefit_claims WHERE identity_digest = 'identity-digest-1'`),
    'account-context-1',
  );
});

test('phone and Apple identities atomically claim one persistent 100-point trial', async () => {
  const accountId = '60000000-0000-4000-8000-000000000001';
  const config = appleConfig();
  const service = new AccountIdentityService(config, { db: serviceDatabase });
  const authUser = psql(`INSERT INTO auth.users (id) VALUES ('${accountId}');`);
  assert.equal(authUser.status, 0, authUser.stderr);
  const source = {
    ...authSession({ accountId, authUserId: accountId, sessionId: '60000000-0000-4000-8000-000000000002' }),
    identities: [{ provider: 'apple', subject: 'dual-trial-apple-subject' }],
    user: {
      id: accountId,
      phone: '+8613811111111',
    },
  };
  await service.resolve(source);
  await service.resolve(source);

  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM lifetime_identity_benefit_claims WHERE claim_context_digest = (
      SELECT claim_context_digest FROM lifetime_identity_benefit_claims
      WHERE provider = 'phone' ORDER BY claimed_at DESC LIMIT 1
    ) AND benefit_key = 'free-trial-100-v1'`),
    '4',
    'two identities times current and previous digest aliases must be occupied',
  );
  assert.equal(
    queryScalar(`SELECT COUNT(*)::text || ':' || SUM(granted_points)::text FROM ai_point_batches
      WHERE account_id = '${accountId}' AND source_type = 'trial'`),
    '1:100',
  );
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_ledger_entries
      WHERE account_id = '${accountId}' AND entry_type = 'grant' AND points = 100`),
    '1',
  );
});

test('deletion and re-registration cannot repeat an identity trial', async () => {
  const oldAccountId = '60000000-0000-4000-8000-000000000010';
  const newAccountId = '60000000-0000-4000-8000-000000000011';
  const config = appleConfig();
  const service = new AccountIdentityService(config, { db: serviceDatabase });
  const phone = '+8613822222222';
  const authUsers = psql(`INSERT INTO auth.users (id) VALUES ('${oldAccountId}'), ('${newAccountId}');`);
  assert.equal(authUsers.status, 0, authUsers.stderr);
  await service.resolve({
    ...authSession({ accountId: oldAccountId, authUserId: oldAccountId, sessionId: '60000000-0000-4000-8000-000000000012' }),
    user: { id: oldAccountId, phone },
  });
  const removeActiveIdentity = psql(`
    DELETE FROM profiles WHERE user_id = '${oldAccountId}';
    DELETE FROM account_identities WHERE account_id = '${oldAccountId}';
    DELETE FROM accounts WHERE id = '${oldAccountId}';
  `);
  assert.equal(removeActiveIdentity.status, 0, removeActiveIdentity.stderr);

  await service.resolve({
    ...authSession({ accountId: newAccountId, authUserId: newAccountId, sessionId: '60000000-0000-4000-8000-000000000013' }),
    user: { id: newAccountId, phone },
  });
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_batches
      WHERE account_id IN ('${oldAccountId}', '${newAccountId}') AND source_type = 'trial'`),
    '1',
  );
  assert.equal(
    queryScalar(`SELECT COUNT(DISTINCT claim_context_digest) FROM lifetime_identity_benefit_claims
      WHERE benefit_key = 'free-trial-100-v1' AND provider = 'phone'
      AND identity_digest IN (
        SELECT identity_digest FROM lifetime_identity_benefit_claims
        WHERE claim_context_digest = (
          SELECT claim_context_digest FROM lifetime_identity_benefit_claims
          WHERE provider = 'phone' ORDER BY claimed_at DESC LIMIT 1
        )
      )`),
    '1',
  );
});

test('old and new digest-key deployments conflict on the shared alias and grant only once', async () => {
  const oldConfig = {
    accountIdentityHashSecret: 'stable-account-identity-owner-secret-32-bytes',
    identityBenefitDigestKeyVersion: 1,
    identityBenefitDigestSecret: 'previous-identity-digest-secret-32-bytes',
  };
  const newConfig = appleConfig();
  const phone = '+8613833333333';
  const oldAccountId = '60000000-0000-4000-8000-000000000020';
  const newAccountId = '60000000-0000-4000-8000-000000000021';
  const oldService = new AccountIdentityService(oldConfig, { db: serviceDatabase });
  const newService = new AccountIdentityService(newConfig, { db: serviceDatabase });
  const authUsers = psql(`INSERT INTO auth.users (id) VALUES ('${oldAccountId}'), ('${newAccountId}');`);
  assert.equal(authUsers.status, 0, authUsers.stderr);
  const attempts = await Promise.allSettled([
    oldService.resolve({
      ...authSession({ accountId: oldAccountId, authUserId: oldAccountId, sessionId: '60000000-0000-4000-8000-000000000022' }),
      user: { id: oldAccountId, phone },
    }),
    newService.resolve({
      ...authSession({ accountId: newAccountId, authUserId: newAccountId, sessionId: '60000000-0000-4000-8000-000000000023' }),
      user: { id: newAccountId, phone },
    }),
  ]);
  assert.ok(attempts.some(({ status }) => status === 'fulfilled'));
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_batches
      WHERE account_id IN ('${oldAccountId}', '${newAccountId}') AND source_type = 'trial'`),
    '1',
  );
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM accounts
      WHERE id IN ('${oldAccountId}', '${newAccountId}') AND status = 'active'`),
    '1',
    'benefit digest rotation must not split the account identity owner',
  );
});

test('account deletion durably denies sessions, revokes commerce, deletes active data, and retains legal evidence', async () => {
  const accountId = '70000000-0000-4000-8000-000000000001';
  const sessionId = '70000000-0000-4000-8000-000000000002';
  const source = await deletionAccount({ accountId, phone: '+8613844444444', sessionId });
  const lifetimeClaimCountBefore = queryScalar('SELECT COUNT(*) FROM lifetime_identity_benefit_claims');
  const { recentAuth, service } = deletionService();
  const grant = await recentAuth.issueVerifiedGrant(source, 'password', 'account_delete');
  const unusedGrant = await recentAuth.issueVerifiedGrant(source, 'password', 'account_delete');
  const batchId = queryScalar(`SELECT id FROM ai_point_batches WHERE account_id = '${accountId}' AND source_type = 'trial'`);
  const reservationId = '70000000-0000-4000-8000-000000000003';
  const reservation = psql(`
    BEGIN;
    UPDATE ai_point_batches SET reserved_points = 10 WHERE id = '${batchId}';
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES (
      '${reservationId}', 'production', '${accountId}', 'delete-reserved-op',
      'transcription_opi', 'ai-points-v1', 10, 'reserved'
    );
    INSERT INTO ai_point_reservation_allocations (
      environment, account_id, reservation_id, batch_id, points
    ) VALUES ('production', '${accountId}', '${reservationId}', '${batchId}', 10);
    COMMIT;
  `);
  assert.equal(reservation.status, 0, reservation.stderr);

  const input = {
    confirmation: '注销账号',
    grantId: grant.grantId,
    idempotencyKey: '70000000-0000-4000-8000-000000000004',
  };
  const result = await service.requestDeletion(source, input);
  assert.deepEqual(result, {
    identityProviderOutcome: 'not_applicable',
    jobId: result.jobId,
    status: 'completed',
  });
  assert.deepEqual(await service.requestDeletion(source, input), result, 'the same request must be idempotent');
  assert.equal(queryScalar(`SELECT status FROM accounts WHERE id = '${accountId}'`), 'deleted');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM profiles WHERE user_id = '${accountId}'`), '0');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM account_identities WHERE account_id = '${accountId}'`), '0');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM recent_auth_grants WHERE account_id = '${accountId}'`), '0');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM recent_auth_challenges WHERE account_id = '${accountId}'`), '0');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM recent_auth_grants WHERE id = '${unusedGrant.grantId}'`), '0');
  assert.equal(queryScalar(`SELECT status FROM ai_point_batches WHERE id = '${batchId}'`), 'revoked');
  assert.equal(queryScalar(`SELECT status FROM ai_point_reservations WHERE id = '${reservationId}'`), 'released');
  assert.equal(
    queryScalar(`SELECT reserved_points::text || ':' || consumed_points::text FROM ai_point_batches WHERE id = '${batchId}'`),
    '0:0',
  );
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_ledger_entries WHERE batch_id = '${batchId}' AND entry_type IN ('release', 'revoke')`),
    '2',
  );
  assert.equal(
    queryScalar('SELECT COUNT(*) FROM lifetime_identity_benefit_claims'),
    lifetimeClaimCountBefore,
    'account deletion must retain lifetime benefit claims as anti-abuse evidence',
  );
  assert.equal(queryScalar(`SELECT COUNT(*) FROM account_session_revocations WHERE session_id = '${sessionId}'`), '1');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM account_deletion_auth_users WHERE job_id = '${result.jobId}'`), '0');
  assert.equal(
    queryScalar(`SELECT (requested_by_auth_user_id IS NULL)::text || ':' || jsonb_array_length(object_keys)::text FROM account_deletion_jobs WHERE id = '${result.jobId}'`),
    'true:0',
  );
  assert.equal(
    queryScalar(`SELECT floor(extract(epoch from (legal_retention_until - created_at)) / 86400)::text FROM account_deletion_tombstones WHERE job_id = '${result.jobId}'`),
    '1095',
  );
  assert.equal(
    queryScalar(`SELECT floor(extract(epoch from (retention_at - created_at)) / 86400)::text FROM account_security_events WHERE metadata->>'deletionJobId' = '${result.jobId}' ORDER BY created_at LIMIT 1`),
    '183',
  );

  const otherAccountId = '70000000-0000-4000-8000-000000000010';
  const other = await deletionAccount({
    accountId: otherAccountId,
    phone: '+8613855555555',
    sessionId: '70000000-0000-4000-8000-000000000011',
  });
  const otherGrant = await recentAuth.issueVerifiedGrant(other, 'password', 'account_delete');
  await assert.rejects(service.requestDeletion(other, {
    confirmation: '注销账号',
    grantId: otherGrant.grantId,
    idempotencyKey: input.idempotencyKey,
  }), /account_deletion_idempotency_conflict/u);
  assert.equal(
    queryScalar(`SELECT (consumed_at IS NULL)::text FROM recent_auth_grants WHERE id = '${otherGrant.grantId}'`),
    'true',
  );
});

test('deletion resumes after provider, auth-user, and object failures without exposing active data as completed', async () => {
  const accountId = '70000000-0000-4000-8000-000000000020';
  const sessionId = '70000000-0000-4000-8000-000000000021';
  const authSetup = psql(`
    INSERT INTO auth.users (id) VALUES ('${accountId}');
    INSERT INTO auth.sessions (id, user_id) VALUES ('${sessionId}', '${accountId}');
  `);
  assert.equal(authSetup.status, 0, authSetup.stderr);
  const source = {
    ...authSession({ accountId, authUserId: accountId, sessionId }),
    identities: [{ provider: 'apple', subject: 'deletion-legacy-apple-subject' }],
    user: { id: accountId, providers: ['apple'] },
  };
  await new AccountIdentityService(appleConfig(), { db: serviceDatabase }).resolve(source);
  const secondAuthUserId = '70000000-0000-4000-8000-000000000023';
  const secondSessionId = '70000000-0000-4000-8000-000000000024';
  const secondAuthSetup = psql(`
    INSERT INTO auth.users (id) VALUES ('${secondAuthUserId}');
    INSERT INTO auth.sessions (id, user_id) VALUES ('${secondSessionId}', '${secondAuthUserId}');
    INSERT INTO account_identities (account_id, auth_user_id, provider, subject_hash)
    VALUES ('${accountId}', '${secondAuthUserId}', 'phone', '${'b'.repeat(64)}');
  `);
  assert.equal(secondAuthSetup.status, 0, secondAuthSetup.stderr);
  const authDeleteCounts = new Map();
  let appleRevokeCount = 0;
  const { recentAuth, service } = deletionService({
    appleAuth: {
      revokeForAccount: async () => {
        appleRevokeCount += 1;
        return { outcome: 'manual_action_required' };
      },
    },
    authAdmin: {
      deleteUser: async (authUserId) => {
        const count = (authDeleteCounts.get(authUserId) ?? 0) + 1;
        authDeleteCounts.set(authUserId, count);
        if (authUserId === secondAuthUserId && count === 1) throw new Error('simulated_failure');
      },
    },
  });
  const grant = await recentAuth.issueVerifiedGrant(source, 'apple', 'account_delete');
  const first = await service.requestDeletion(source, {
    confirmation: '注销账号',
    grantId: grant.grantId,
    idempotencyKey: '70000000-0000-4000-8000-000000000022',
  });
  assert.equal(first.status, 'retryable');
  assert.equal(first.identityProviderOutcome, 'manual_action_required');
  assert.equal(queryScalar(`SELECT status FROM accounts WHERE id = '${accountId}'`), 'deleting');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM profiles WHERE user_id = '${accountId}'`), '1');

  const completed = await service.processJob(first.jobId, new Date(Date.now() + 2 * 60 * 1_000));
  assert.equal(completed.status, 'completed');
  assert.equal(completed.identityProviderOutcome, 'manual_action_required');
  assert.equal(appleRevokeCount, 1, 'the durable provider marker must skip an already completed step');
  assert.equal(authDeleteCounts.get(accountId), 1, 'an already deleted auth user must not be called twice');
  assert.equal(authDeleteCounts.get(secondAuthUserId), 2, 'only the failed auth user must be retried');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM account_session_revocations WHERE session_id IN ('${sessionId}', '${secondSessionId}')`), '2');
  assert.equal(queryScalar(`SELECT status FROM accounts WHERE id = '${accountId}'`), 'deleted');
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM apple_revocable_credentials WHERE account_id = '${accountId}'`),
    '0',
    'completed deletion must not retain provider credentials or raw provider auth-user IDs',
  );

  const objectAccountId = '70000000-0000-4000-8000-000000000030';
  const objectSource = await deletionAccount({
    accountId: objectAccountId,
    phone: '+8613866666666',
    sessionId: '70000000-0000-4000-8000-000000000031',
  });
  const feedbackSetup = psql(`
    INSERT INTO feedback_tickets (
      id, ticket_number, user_id, client_submission_id, category, description,
      status, source, source_route, app_display_version, platform, retention_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000032', 'DEL-OBJECT-1', '${objectAccountId}',
      '70000000-0000-4000-8000-000000000033', 'other', 'delete me', 'received',
      'profile', '/profile', '1.0.0', 'ios', now() + interval '1 year'
    );
    INSERT INTO feedback_attachments (
      id, ticket_id, object_key, mime_type, size_bytes, checksum, expires_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000034', '70000000-0000-4000-8000-000000000032',
      'feedback/delete-object.jpg', 'image/jpeg', 12, '${'a'.repeat(64)}', now() + interval '1 day'
    );
  `);
  assert.equal(feedbackSetup.status, 0, feedbackSetup.stderr);
  let objectCleanupCount = 0;
  const objectFixture = deletionService({
    feedback: {
      removeObjects: async (keys) => {
        assert.deepEqual(keys, ['feedback/delete-object.jpg']);
        objectCleanupCount += 1;
        if (objectCleanupCount === 1) throw new Error('simulated_object_failure');
      },
    },
  });
  const objectGrant = await objectFixture.recentAuth.issueVerifiedGrant(objectSource, 'password', 'account_delete');
  const objectFirst = await objectFixture.service.requestDeletion(objectSource, {
    confirmation: '注销账号',
    grantId: objectGrant.grantId,
    idempotencyKey: '70000000-0000-4000-8000-000000000035',
  });
  assert.equal(objectFirst.status, 'retryable');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM feedback_attachments WHERE id = '70000000-0000-4000-8000-000000000034'`), '1');
  const objectCompleted = await objectFixture.service.processJob(
    objectFirst.jobId,
    new Date(Date.now() + 2 * 60 * 1_000),
  );
  assert.equal(objectCompleted.status, 'completed');
  assert.equal(objectCleanupCount, 2);
  assert.equal(queryScalar(`SELECT COUNT(*) FROM feedback_attachments WHERE id = '70000000-0000-4000-8000-000000000034'`), '0');
  assert.equal(queryScalar(`SELECT jsonb_array_length(object_keys) FROM account_deletion_jobs WHERE id = '${objectFirst.jobId}'`), '0');
});

test('account deletion revokes a registered Apple credential before clearing provider secrets', async () => {
  const accountId = '70000000-0000-4000-8000-000000000040';
  const authUserId = accountId;
  const sessionId = '70000000-0000-4000-8000-000000000042';
  const authSetup = psql(`
    INSERT INTO auth.users (id) VALUES ('${authUserId}');
    INSERT INTO auth.sessions (id, user_id) VALUES ('${sessionId}', '${authUserId}');
  `);
  assert.equal(authSetup.status, 0, authSetup.stderr);
  const source = appleSession({
    accountId,
    authUserId,
    sessionId,
    subject: 'deletion-registered-apple-subject',
  });
  await new AccountIdentityService(appleConfig(), { db: serviceDatabase }).resolve(source);
  const rawNonce = 'deletion-registered-apple-nonce';
  let revokeCount = 0;
  const appleAuth = appleService({
    exchangeAuthorizationCode: async () => ({
      accessToken: 'temporary-access-token',
      idToken: appleIdToken({ nonce: rawNonce, subject: source.identities[0].subject }),
      refreshToken: 'deletion-registered-refresh-token',
    }),
    revoke: async () => { revokeCount += 1; },
  });
  await appleAuth.registerCredential(source, {
    authorizationCode: 'deletion-register-code',
    rawNonce,
  });
  let providerAttempts = 0;
  const fixture = deletionService({
    appleAuth: {
      revokeForAccount: async (...args) => {
        providerAttempts += 1;
        const result = await appleAuth.revokeForAccount(...args);
        if (providerAttempts === 1) throw new Error('crash_after_remote_revoke');
        return result;
      },
    },
  });
  const grant = await fixture.recentAuth.issueVerifiedGrant(source, 'apple', 'account_delete');
  const interrupted = await fixture.service.requestDeletion(source, {
    confirmation: '注销账号',
    grantId: grant.grantId,
    idempotencyKey: '70000000-0000-4000-8000-000000000043',
  });
  assert.equal(interrupted.status, 'retryable');
  assert.equal(interrupted.identityProviderOutcome, 'pending');
  assert.equal(
    queryScalar(`SELECT status FROM apple_revocable_credentials WHERE account_id = '${accountId}'`),
    'revoked',
  );
  const result = await fixture.service.processJob(
    interrupted.jobId,
    new Date(Date.now() + 2 * 60 * 1_000),
  );
  assert.equal(result.status, 'completed');
  assert.equal(result.identityProviderOutcome, 'revoked');
  assert.equal(revokeCount, 1);
  assert.equal(providerAttempts, 2, 'job retry must re-read the durable provider credential marker');
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM apple_revocable_credentials WHERE account_id = '${accountId}'`),
    '0',
    'completion must clear encrypted provider credentials and raw provider auth-user IDs',
  );
});

test('account deletion write barrier drains committed writes and rejects every post-finalization write', async () => {
  const accountId = '70000000-0000-4000-8000-000000000050';
  const source = await deletionAccount({
    accountId,
    phone: '+8613877777777',
    sessionId: '70000000-0000-4000-8000-000000000051',
  });
  const ticketSetup = psql(`
    INSERT INTO feedback_tickets (
      id, ticket_number, user_id, client_submission_id, category, description,
      status, source, source_route, app_display_version, platform, retention_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000053', 'DEL-RACE-1', '${accountId}',
      '70000000-0000-4000-8000-000000000054', 'other', 'attachment race', 'received',
      'profile', '/profile', '1.0.0', 'ios', now() + interval '1 year'
    );
  `);
  assert.equal(ticketSetup.status, 0, ticketSetup.stderr);
  const removedObjectBatches = [];
  const fixture = deletionService({
    feedback: {
      removeObjects: async (keys) => { removedObjectBatches.push(keys); },
    },
  });
  const grant = await fixture.recentAuth.issueVerifiedGrant(source, 'password', 'account_delete');
  const writerClient = postgres({ database: 'postgres', host: socketDirectory, max: 1, port, username: 'postgres' });
  let writerInserted;
  let releaseWriter;
  const inserted = new Promise((resolve) => { writerInserted = resolve; });
  const release = new Promise((resolve) => { releaseWriter = resolve; });
  const writer = writerClient.begin(async (transaction) => {
    await transaction`
      INSERT INTO feedback_attachments (
        id, ticket_id, object_key, mime_type, size_bytes, checksum, expires_at
      ) VALUES (
        '70000000-0000-4000-8000-000000000055',
        '70000000-0000-4000-8000-000000000053',
        'feedback/deletion-attachment-race.jpg', 'image/jpeg', 12, ${'a'.repeat(64)},
        now() + interval '1 day'
      )
    `;
    writerInserted();
    await release;
  });
  await inserted;
  let deletionSettled = false;
  const deletion = fixture.service.requestDeletion(source, {
    confirmation: '注销账号',
    grantId: grant.grantId,
    idempotencyKey: '70000000-0000-4000-8000-000000000052',
  }).then((value) => {
    deletionSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(deletionSettled, false, 'deletion must wait for a writer holding the account row barrier');
  releaseWriter();
  await writer;
  assert.equal((await deletion).status, 'completed');
  assert.deepEqual(removedObjectBatches, [['feedback/deletion-attachment-race.jpg']]);
  assert.equal(queryScalar(`SELECT COUNT(*) FROM feedback_attachments WHERE id = '70000000-0000-4000-8000-000000000055'`), '0');
  await assert.rejects(
    writerClient`
      INSERT INTO ai_word_cache (user_id, query_hash, result, expires_at)
      VALUES (${accountId}, 'deletion-write-after-finalize', ${writerClient.json({ value: 'must-fail' })}, now() + interval '1 hour')
    `,
    /account_not_active/u,
  );
  await writerClient.end({ timeout: 5 });
});

test('account deletion lease fencing prevents a stale worker from regressing completion', async () => {
  const accountId = '70000000-0000-4000-8000-000000000060';
  const source = await deletionAccount({
    accountId,
    phone: '+8613888888888',
    sessionId: '70000000-0000-4000-8000-000000000061',
  });
  let firstStarted;
  let releaseFirst;
  const started = new Promise((resolve) => { firstStarted = resolve; });
  const release = new Promise((resolve) => { releaseFirst = resolve; });
  let deleteCalls = 0;
  const fixture = deletionService({
    authAdmin: {
      deleteUser: async () => {
        deleteCalls += 1;
        if (deleteCalls === 1) {
          firstStarted();
          await release;
          throw new Error('stale_worker_failure');
        }
      },
    },
  });
  const grant = await fixture.recentAuth.issueVerifiedGrant(source, 'password', 'account_delete');
  const first = fixture.service.requestDeletion(source, {
    confirmation: '注销账号',
    grantId: grant.grantId,
    idempotencyKey: '70000000-0000-4000-8000-000000000062',
  });
  await started;
  const jobId = queryScalar(`SELECT id FROM account_deletion_jobs WHERE account_id = '${accountId}'`);
  const second = await fixture.service.processJob(jobId, new Date(Date.now() + 6 * 60 * 1_000));
  assert.equal(second.status, 'completed');
  releaseFirst();
  assert.equal((await first).status, 'completed');
  assert.equal(queryScalar(`SELECT status || ':' || (lease_token IS NULL)::text FROM account_deletion_jobs WHERE id = '${jobId}'`), 'completed:true');
  assert.equal(deleteCalls, 2);
});

test('deletion capability collisions are uniformly 409, rate-limited, and purged after retention', async () => {
  const accountIds = [
    '70000000-0000-4000-8000-000000000070',
    '70000000-0000-4000-8000-000000000071',
  ];
  const sources = await Promise.all(accountIds.map((accountId, index) => deletionAccount({
    accountId,
    phone: `+861389999999${index}`,
    sessionId: `70000000-0000-4000-8000-00000000007${index + 2}`,
  })));
  const fixture = deletionService();
  const grants = await Promise.all(sources.map((source) => (
    fixture.recentAuth.issueVerifiedGrant(source, 'password', 'account_delete')
  )));
  const capability = '70000000-0000-4000-8000-000000000074';
  const attempts = await Promise.allSettled(sources.map((source, index) => fixture.service.requestDeletion(source, {
    confirmation: '注销账号',
    grantId: grants[index].grantId,
    idempotencyKey: capability,
  })));
  assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
  const rejected = attempts.find(({ status }) => status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.equal(rejected.reason?.status, 409);
  assert.equal(rejected.reason?.message, 'account_deletion_idempotency_conflict');
  const winnerJobId = queryScalar(`SELECT id FROM account_deletion_jobs WHERE idempotency_key = '${capability}'`);
  const loserAccountId = queryScalar(`SELECT id FROM accounts WHERE id IN ('${accountIds[0]}', '${accountIds[1]}') AND status = 'active'`);
  const loserIndex = accountIds.indexOf(loserAccountId);
  assert.equal(queryScalar(`SELECT (consumed_at IS NULL)::text FROM recent_auth_grants WHERE id = '${grants[loserIndex].grantId}'`), 'true');

  for (let index = 0; index < 30; index += 1) {
    assert.equal((await fixture.service.statusByIdempotencyKey(capability, '203.0.113.70')).status, 'completed');
  }
  await assert.rejects(
    fixture.service.statusByIdempotencyKey(capability, '203.0.113.70'),
    (error) => error?.status === 429 && error?.message === 'account_deletion_status_rate_limited',
  );

  const retentionNow = new Date();
  const expire = psql(`
    UPDATE account_deletion_tombstones
    SET created_at = now() - interval '4 years', legal_retention_until = now() - interval '1 day'
    WHERE job_id = '${winnerJobId}';
    UPDATE account_security_events
    SET created_at = now() - interval '184 days', retention_at = now() - interval '1 day'
    WHERE metadata->>'deletionJobId' = '${winnerJobId}';
  `);
  assert.equal(expire.status, 0, expire.stderr);
  await fixture.service.purgeExpiredRecords(retentionNow);
  assert.equal(queryScalar(`SELECT COUNT(*) FROM account_deletion_jobs WHERE id = '${winnerJobId}'`), '0');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM account_deletion_tombstones WHERE job_id = '${winnerJobId}'`), '0');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM account_security_events WHERE metadata->>'deletionJobId' = '${winnerJobId}'`), '0');
  assert.equal(
    queryScalar(`SELECT COUNT(*)::text || ':' || COUNT(*) FILTER (WHERE deletion_job_id IS NULL)::text FROM account_content_credential_revocations WHERE account_id = (SELECT id FROM accounts WHERE status = 'deleted' AND id IN ('${accountIds[0]}', '${accountIds[1]}'))`),
    '1:1',
    'content credential revocation must outlive deletion evidence without retaining a job FK',
  );
});

test('phone OTP intents are purpose-bound, restart-safe, and consumed once across API instances', async () => {
  const config = appleConfig();
  const accountId = '71000000-0000-4000-8000-000000000001';
  const source = authSession({
    accountId,
    authUserId: accountId,
    sessionId: '71000000-0000-4000-8000-000000000002',
  });
  const startedAt = new Date();
  const otpAt = new Date(startedAt.getTime() + 2_000);
  source.authenticationMethods = [{ method: 'otp', timestamp: Math.floor(otpAt.getTime() / 1_000) }];
  source.issuedAt = Math.floor(otpAt.getTime() / 1_000);
  const phoneDigest = createHmac('sha256', config.accountIdentityHashSecret)
    .update(`phone-otp-intent-v1\0${source.user.phone}`)
    .digest('hex');
  const intent = psql(`
    INSERT INTO phone_otp_intents (
      phone_digest, purpose, account_id, otp_not_before, expires_at, created_at
    ) VALUES (
      '${phoneDigest}', 'account_delete', '${accountId}',
      '${new Date(startedAt.getTime() + 1_000).toISOString()}',
      '${new Date(startedAt.getTime() + 10 * 60 * 1_000).toISOString()}',
      '${startedAt.toISOString()}'
    );
  `);
  assert.equal(intent.status, 0, intent.stderr);
  const firstPhone = new PhoneAuthService(config, { db: serviceDatabase });
  const secondPhone = new PhoneAuthService(config, { db: serviceDatabase });
  const firstRecent = new RecentAuthService(
    config,
    { db: serviceDatabase },
    { verify: async () => undefined },
    firstPhone,
  );
  const secondRecent = new RecentAuthService(
    config,
    { db: serviceDatabase },
    { verify: async () => undefined },
    secondPhone,
  );
  const failureTrigger = psql(`
    CREATE FUNCTION fail_test_phone_grant_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.method = 'phone_otp' THEN RAISE EXCEPTION 'simulated_phone_grant_insert_failure'; END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER fail_test_phone_grant_insert
    BEFORE INSERT ON recent_auth_grants
    FOR EACH ROW EXECUTE FUNCTION fail_test_phone_grant_insert();
  `);
  assert.equal(failureTrigger.status, 0, failureTrigger.stderr);
  await assert.rejects(
    firstRecent.issuePhoneOtpGrant(source, 'account_delete', otpAt),
    (error) => error?.cause?.message === 'simulated_phone_grant_insert_failure',
  );
  const removeFailureTrigger = psql(`
    DROP TRIGGER fail_test_phone_grant_insert ON recent_auth_grants;
    DROP FUNCTION fail_test_phone_grant_insert();
  `);
  assert.equal(removeFailureTrigger.status, 0, removeFailureTrigger.stderr);
  assert.equal(
    queryScalar(`SELECT status || ':' || (consumed_at IS NULL)::text FROM phone_otp_intents WHERE phone_digest = '${phoneDigest}'`),
    'pending:true',
    'grant persistence failure must roll back OTP intent consumption',
  );
  const attempts = await Promise.allSettled([
    firstRecent.issuePhoneOtpGrant(source, 'account_delete', otpAt),
    secondRecent.issuePhoneOtpGrant(source, 'account_delete', otpAt),
  ]);
  assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(({ status }) => status === 'rejected').length, 1);
  assert.equal(
    queryScalar(`SELECT status || ':' || (consumed_at IS NOT NULL)::text FROM phone_otp_intents WHERE phone_digest = '${phoneDigest}'`),
    'consumed:true',
  );
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM recent_auth_grants WHERE account_id = '${accountId}' AND method = 'phone_otp' AND purpose = 'account_delete'`),
    '1',
  );

  const recoveryIntent = psql(`
    INSERT INTO phone_otp_intents (
      phone_digest, purpose, account_id, otp_not_before, expires_at, created_at
    ) VALUES (
      '${phoneDigest}', 'password_recovery', NULL,
      '${new Date(startedAt.getTime() + 1_000).toISOString()}',
      '${new Date(startedAt.getTime() + 10 * 60 * 1_000).toISOString()}',
      '${startedAt.toISOString()}'
    );
  `);
  assert.equal(recoveryIntent.status, 0, recoveryIntent.stderr);
  await assert.rejects(
    firstRecent.issuePhoneOtpGrant(source, 'account_delete', otpAt),
    /phone_reauthentication_required/u,
  );
  const recoveryGrant = await secondRecent.issuePhoneOtpGrant(source, 'password_recovery', otpAt);
  assert.equal(recoveryGrant.purpose, 'password_recovery');
  await secondRecent.consume(source, recoveryGrant.grantId, 'password_recovery', otpAt);
  await assert.rejects(
    firstRecent.consume(source, recoveryGrant.grantId, 'password_recovery', otpAt),
    /recent_auth_required/u,
  );

  const bindingIntent = psql(`
    INSERT INTO phone_otp_intents (
      phone_digest, purpose, account_id, otp_not_before, expires_at, created_at
    ) VALUES (
      '${phoneDigest}', 'phone_binding', '${accountId}',
      '${new Date(startedAt.getTime() + 1_000).toISOString()}',
      '${new Date(startedAt.getTime() + 10 * 60 * 1_000).toISOString()}',
      '${startedAt.toISOString()}'
    );
  `);
  assert.equal(bindingIntent.status, 0, bindingIntent.stderr);
  await assert.rejects(
    firstPhone.consumeOtpIntent(source, 'phone_binding', otpAt, '71000000-0000-4000-8000-000000000099'),
    /phone_reauthentication_required/u,
  );
  await firstPhone.consumeOtpIntent(source, 'phone_binding', otpAt, accountId);

  const exactSecond = Math.floor(Date.now() / 1_000) * 1_000;
  const earlierStart = new Date(exactSecond + 100);
  const laterStart = new Date(exactSecond + 700);
  await Promise.all([
    firstPhone.recordIntent(source.user.phone, 'phone_binding', accountId, laterStart),
    secondPhone.recordIntent(source.user.phone, 'phone_binding', accountId, earlierStart),
  ]);
  assert.equal(
    queryScalar(`
      SELECT COUNT(*)::text || ':' ||
        floor(extract(epoch from min(created_at)) * 1000)::bigint::text || ':' ||
        floor(extract(epoch from min(otp_not_before)) * 1000)::bigint::text
      FROM phone_otp_intents
      WHERE phone_digest = '${phoneDigest}' AND purpose = 'phone_binding' AND status = 'pending'
    `),
    `1:${laterStart.getTime()}:${exactSecond}`,
    'concurrent starts must retain only the newest request while accepting an OTP issued in that same second',
  );
  source.authenticationMethods = [{ method: 'otp', timestamp: exactSecond / 1_000 }];
  const consumeAt = new Date(exactSecond + 2_000);
  await assert.rejects(
    serviceDatabase.transaction(async (transaction) => {
      await firstPhone.consumeOtpIntentInTransaction(
        transaction,
        source,
        'phone_binding',
        consumeAt,
        accountId,
      );
      throw new Error('simulated_phone_binding_failure');
    }),
    /simulated_phone_binding_failure/u,
  );
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM phone_otp_intents
      WHERE phone_digest = '${phoneDigest}' AND purpose = 'phone_binding'
        AND status = 'pending' AND consumed_at IS NULL`),
    '1',
    'a downstream phone-binding failure must roll back proof consumption',
  );
  await firstPhone.consumeOtpIntent(source, 'phone_binding', consumeAt, accountId);
});

test('SMS delivery authority persists dedupe, rate limits, and lease fencing across instances', async () => {
  const phone = '+8613811112222';
  const now = new Date('2026-08-24T10:00:00.000Z');
  const first = new SmsDeliveryAuthority(smsAuthorityConfig(), { db: serviceDatabase });
  const second = new SmsDeliveryAuthority(smsAuthorityConfig(), { db: serviceDatabase });
  const [left, right] = await Promise.all([
    first.claim('sms-dedupe-concurrent', phone, now),
    second.claim('sms-dedupe-concurrent', phone, now),
  ]);
  const claimed = [left, right].find(({ outcome }) => outcome === 'claimed');
  assert.ok(claimed && claimed.outcome === 'claimed');
  assert.equal([left, right].filter(({ outcome }) => outcome === 'duplicate_inflight').length, 1);
  await first.complete('sms-dedupe-concurrent', '00000000-0000-4000-8000-000000000099', now);
  assert.equal(queryScalar(`SELECT status FROM sms_delivery_attempts WHERE dedupe_key = 'sms-dedupe-concurrent'`), 'processing');
  await first.complete('sms-dedupe-concurrent', claimed.leaseToken, now);
  assert.equal((await second.claim('sms-dedupe-concurrent', phone, new Date(now.getTime() + 1_000))).outcome, 'duplicate_completed');

  const expiring = await first.claim('sms-dedupe-expired-lease', '+8613811113333', now);
  assert.equal(expiring.outcome, 'claimed');
  assert.ok(expiring.outcome === 'claimed');
  const replacement = await second.claim(
    'sms-dedupe-expired-lease',
    '+8613811113333',
    new Date(now.getTime() + 3 * 60 * 1_000),
  );
  assert.equal(replacement.outcome, 'claimed');
  assert.ok(replacement.outcome === 'claimed');
  const counterTotalBeforeStaleFailure = queryScalar('SELECT SUM(count) FROM sms_usage_counters');
  await first.fail('sms-dedupe-expired-lease', expiring.leaseToken, expiring.rules, new Date(now.getTime() + 3 * 60 * 1_000));
  await first.complete('sms-dedupe-expired-lease', expiring.leaseToken, new Date(now.getTime() + 3 * 60 * 1_000));
  assert.equal(queryScalar('SELECT SUM(count) FROM sms_usage_counters'), counterTotalBeforeStaleFailure);
  assert.equal(
    queryScalar(`SELECT status || ':' || lease_token::text FROM sms_delivery_attempts WHERE dedupe_key = 'sms-dedupe-expired-lease'`),
    `processing:${replacement.leaseToken}`,
  );
  await second.complete('sms-dedupe-expired-lease', replacement.leaseToken, new Date(now.getTime() + 3 * 60 * 1_000));

  const limitedConfig = smsAuthorityConfig({ phoneDailyLimit: 1, phoneHourlyLimit: 1 });
  const limited = new SmsDeliveryAuthority(limitedConfig, { db: serviceDatabase });
  const limitedPhone = '+8613811114444';
  const budget = await limited.claim('sms-budget-first', limitedPhone, now);
  assert.equal(budget.outcome, 'claimed');
  assert.ok(budget.outcome === 'claimed');
  await limited.fail('sms-budget-first', budget.leaseToken, budget.rules, now);
  await assert.rejects(
    limited.claim('sms-budget-second', limitedPhone, now),
    /sms_rate_limited/u,
  );
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM sms_delivery_attempts WHERE dedupe_key = 'sms-budget-second'`),
    '0',
  );

  const failed = await first.claim('sms-failed-retry', '+8613811115555', now);
  assert.ok(failed.outcome === 'claimed');
  await first.fail('sms-failed-retry', failed.leaseToken, failed.rules, now);
  assert.equal(
    queryScalar(`SELECT status FROM sms_delivery_attempts WHERE dedupe_key = 'sms-failed-retry'`),
    'retryable',
  );
  assert.equal(
    (await second.claim('sms-failed-retry', '+8613811115555', new Date(now.getTime() + 1_000))).outcome,
    'claimed',
    'a provider failure may retry delivery but must not refund the abuse budget',
  );
});

test('phone and SMS retention cleanup removes only expired, non-active authority rows', async () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  const auth = recentAuthService();
  const retentionSource = authSession({
    accountId: '72000000-0000-4000-8000-000000000010',
    authUserId: '72000000-0000-4000-8000-000000000011',
    sessionId: '72000000-0000-4000-8000-000000000012',
  });
  const expiredGrant = await auth.issueVerifiedGrant(
    retentionSource,
    'password',
    'password_recovery',
    new Date(now.getTime() - 10 * 60 * 1_000),
  );
  const activeGrant = await auth.issueVerifiedGrant(
    retentionSource,
    'password',
    'password_recovery',
    now,
  );
  const expiredChallengeId = queryScalar(`SELECT challenge_id FROM recent_auth_grants WHERE id = '${expiredGrant.grantId}'`);
  const activeChallengeId = queryScalar(`SELECT challenge_id FROM recent_auth_grants WHERE id = '${activeGrant.grantId}'`);
  const setup = psql(`
    INSERT INTO phone_otp_intents (
      id, phone_digest, purpose, status, otp_not_before, expires_at, created_at
    ) VALUES (
      '72000000-0000-4000-8000-000000000001', '${'c'.repeat(64)}', 'login', 'consumed',
      '${new Date(now.getTime() - 19 * 60 * 1_000).toISOString()}',
      '${new Date(now.getTime() - 10 * 60 * 1_000).toISOString()}',
      '${new Date(now.getTime() - 20 * 60 * 1_000).toISOString()}'
    );
    INSERT INTO sms_delivery_attempts (
      dedupe_key, phone_digest, status, lease_token, lease_until, attempt_count,
      completed_at, expires_at, created_at, updated_at
    ) VALUES
      ('sms-retention-completed', '${'d'.repeat(64)}', 'completed',
       '72000000-0000-4000-8000-000000000002', '${new Date(now.getTime() - 1_000).toISOString()}', 1,
       '${new Date(now.getTime() - 2_000).toISOString()}',
       '${new Date(now.getTime() - 1_000).toISOString()}', '${new Date(now.getTime() - 20 * 60 * 1_000).toISOString()}', '${now.toISOString()}'),
      ('sms-retention-expired-lease', '${'e'.repeat(64)}', 'processing',
       '72000000-0000-4000-8000-000000000003', '${new Date(now.getTime() - 1_000).toISOString()}', 1,
       NULL,
       '${new Date(now.getTime() - 1_000).toISOString()}', '${new Date(now.getTime() - 20 * 60 * 1_000).toISOString()}', '${now.toISOString()}'),
      ('sms-retention-active-lease', '${'f'.repeat(64)}', 'processing',
       '72000000-0000-4000-8000-000000000004', '${new Date(now.getTime() + 60_000).toISOString()}', 1,
       NULL,
       '${new Date(now.getTime() - 1_000).toISOString()}', '${new Date(now.getTime() - 20 * 60 * 1_000).toISOString()}', '${now.toISOString()}');
    INSERT INTO sms_usage_counters (scope_key, count, expires_at)
    VALUES ('sms-retention-expired-counter', 1, '${new Date(now.getTime() - 1_000).toISOString()}');
  `);
  assert.equal(setup.status, 0, setup.stderr);
  await new PhoneSecurityRetentionService({ db: serviceDatabase }).cleanup(now);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM phone_otp_intents WHERE id = '72000000-0000-4000-8000-000000000001'`),
    '0',
  );
  assert.equal(
    queryScalar(`SELECT string_agg(dedupe_key, ',' ORDER BY dedupe_key) FROM sms_delivery_attempts WHERE dedupe_key LIKE 'sms-retention-%'`),
    'sms-retention-active-lease',
  );
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM sms_usage_counters WHERE scope_key = 'sms-retention-expired-counter'`),
    '0',
  );
  assert.equal(queryScalar(`SELECT COUNT(*) FROM recent_auth_grants WHERE id = '${expiredGrant.grantId}'`), '0');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM recent_auth_challenges WHERE id = '${expiredChallengeId}'`), '0');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM recent_auth_grants WHERE id = '${activeGrant.grantId}'`), '1');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM recent_auth_challenges WHERE id = '${activeChallengeId}'`), '1');
});

test('recent-auth grants are purpose-bound to a durable challenge', () => {
  const challengeId = '30000000-0000-4000-8000-000000000001';
  const grantId = '30000000-0000-4000-8000-000000000002';
  const accountId = '30000000-0000-4000-8000-000000000003';
  const authUserId = '30000000-0000-4000-8000-000000000004';
  const sessionId = '30000000-0000-4000-8000-000000000005';
  const setup = psql(`
    INSERT INTO recent_auth_challenges (
      id, account_id, auth_user_id, session_id, method, purpose, target_digest,
      status, expires_at, verified_at
    ) VALUES (
      '${challengeId}', '${accountId}', '${authUserId}', '${sessionId}', 'password',
      'account_delete', 'target-digest', 'verified', now() + interval '5 minutes', now()
    );
    INSERT INTO recent_auth_grants (
      id, challenge_id, account_id, auth_user_id, session_id, method, purpose,
      target_digest, expires_at
    ) VALUES (
      '${grantId}', '${challengeId}', '${accountId}', '${authUserId}', '${sessionId}',
      'password', 'account_delete', 'target-digest', now() + interval '5 minutes'
    );
  `);
  assert.equal(setup.status, 0, setup.stderr);

  const duplicateGrant = psql(`
    INSERT INTO recent_auth_grants (
      challenge_id, account_id, auth_user_id, session_id, method, purpose,
      target_digest, expires_at
    ) VALUES (
      '${challengeId}', '${accountId}', '${authUserId}', '${sessionId}',
      'password', 'account_delete', 'target-digest', now() + interval '5 minutes'
    );
  `);
  assert.notEqual(duplicateGrant.status, 0);
  assert.match(duplicateGrant.stderr, /recent_auth_grants_challenge/);

  const invalidPurpose = psql(`
    INSERT INTO recent_auth_challenges (
      account_id, auth_user_id, session_id, method, purpose, target_digest, expires_at
    ) VALUES (
      '${accountId}', '${authUserId}', '${sessionId}', 'password', 'purchase',
      'target-digest', now() + interval '5 minutes'
    );
  `);
  assert.notEqual(invalidPurpose.status, 0);
  assert.match(invalidPurpose.stderr, /recent_auth_challenges_purpose_check/);

  const secondChallengeId = '30000000-0000-4000-8000-000000000006';
  const mismatchedGrant = psql(`
    INSERT INTO recent_auth_challenges (
      id, account_id, auth_user_id, session_id, method, purpose, target_digest,
      status, expires_at, verified_at
    ) VALUES (
      '${secondChallengeId}', '${accountId}', '${authUserId}', '${sessionId}', 'apple',
      'account_delete', 'second-target-digest', 'verified', now() + interval '5 minutes', now()
    );
    INSERT INTO recent_auth_grants (
      challenge_id, account_id, auth_user_id, session_id, method, purpose,
      target_digest, expires_at
    ) VALUES (
      '${secondChallengeId}', '30000000-0000-4000-8000-000000000007', '${authUserId}',
      '${sessionId}', 'apple', 'password_recovery', 'second-target-digest',
      now() + interval '5 minutes'
    );
  `);
  assert.notEqual(mismatchedGrant.status, 0);
  assert.match(mismatchedGrant.stderr, /recent_auth_grant_challenge_mismatch/);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM recent_auth_grants WHERE challenge_id = '${secondChallengeId}'`),
    '0',
  );

  const mutateBoundChallenge = psql(`
    UPDATE recent_auth_challenges
    SET purpose = 'password_recovery'
    WHERE id = '${challengeId}';
  `);
  assert.notEqual(mutateBoundChallenge.status, 0);
  assert.match(mutateBoundChallenge.stderr, /recent_auth_challenge_binding_immutable/);
});

test('recent-auth grants survive service restarts and atomically reject replay, mismatch, and expiry', async () => {
  const firstInstance = recentAuthService();
  const restartedInstance = recentAuthService();
  const source = authSession();

  const restartGrant = await firstInstance.issueVerifiedGrant(source, 'password', 'account_delete');
  await restartedInstance.consume(source, restartGrant.grantId, 'account_delete');
  await assert.rejects(
    firstInstance.consume(source, restartGrant.grantId, 'account_delete'),
    /recent_auth_required/u,
  );

  const purposeGrant = await firstInstance.issueVerifiedGrant(source, 'password', 'account_delete');
  await assert.rejects(
    restartedInstance.consume(source, purposeGrant.grantId, 'password_recovery'),
    /recent_auth_required/u,
  );
  assert.equal(
    queryScalar(`SELECT (consumed_at IS NULL)::text FROM recent_auth_grants WHERE id = '${purposeGrant.grantId}'`),
    'true',
  );
  await restartedInstance.consume(source, purposeGrant.grantId, 'account_delete');

  const sessionGrant = await firstInstance.issueVerifiedGrant(source, 'password', 'account_delete');
  await assert.rejects(
    restartedInstance.consume(authSession({ sessionId: '40000000-0000-4000-8000-000000000004' }), sessionGrant.grantId, 'account_delete'),
    /recent_auth_required/u,
  );
  await restartedInstance.consume(source, sessionGrant.grantId, 'account_delete');

  const expiredGrant = await firstInstance.issueVerifiedGrant(
    source,
    'password',
    'account_delete',
    new Date(Date.now() - 10 * 60 * 1_000),
  );
  await assert.rejects(
    restartedInstance.consume(source, expiredGrant.grantId, 'account_delete'),
    /recent_auth_required/u,
  );
});

test('recent-auth recovery reservations are exclusive, releasable, and commit exactly once', async () => {
  const firstInstance = recentAuthService();
  const secondInstance = recentAuthService();
  const source = authSession({ sessionId: '40000000-0000-4000-8000-000000000006' });
  const grant = await firstInstance.issueVerifiedGrant(source, 'phone_otp', 'password_recovery');
  const attempts = await Promise.allSettled([
    firstInstance.reserve(source, grant.grantId, 'password_recovery'),
    secondInstance.reserve(source, grant.grantId, 'password_recovery'),
  ]);
  const fulfilled = attempts.find(({ status }) => status === 'fulfilled');
  assert.ok(fulfilled && fulfilled.status === 'fulfilled');
  assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(({ status }) => status === 'rejected').length, 1);

  await firstInstance.releaseReservation(grant.grantId, fulfilled.value);
  const retryToken = await secondInstance.reserve(source, grant.grantId, 'password_recovery');
  await secondInstance.commitReservation(
    source,
    grant.grantId,
    'password_recovery',
    retryToken,
  );
  await assert.rejects(
    firstInstance.reserve(source, grant.grantId, 'password_recovery'),
    /recent_auth_required/u,
  );
  assert.equal(
    queryScalar(`
      SELECT grant_row.consumed_at IS NOT NULL AND challenge.status = 'consumed'
      FROM recent_auth_grants grant_row
      JOIN recent_auth_challenges challenge ON challenge.id = grant_row.challenge_id
      WHERE grant_row.id = '${grant.grantId}'
    `),
    't',
  );
});

test('password recent-auth verifies upstream before persisting a purpose-bound grant', async () => {
  let verificationCount = 0;
  const service = recentAuthService({
    verify: async (_source, password) => {
      assert.equal(password, 'review-account-password');
      verificationCount += 1;
    },
  });
  const grant = await service.issuePasswordGrant(
    authSession({ sessionId: '40000000-0000-4000-8000-000000000005' }),
    'account_delete',
    'review-account-password',
  );
  assert.equal(verificationCount, 1);
  assert.equal(grant.method, 'password');
  assert.equal(grant.purpose, 'account_delete');
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM recent_auth_grants WHERE id = '${grant.grantId}' AND purpose = 'account_delete'`),
    '1',
  );
});

test('Apple ID tokens require a valid RS256 signature and matching Apple JWKS kid', async () => {
  const trusted = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = await exportJWK(trusted.publicKey);
  Object.assign(jwk, { alg: 'RS256', kid: 'trusted-apple-key', use: 'sig' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), {
    headers: { 'cache-control': 'public, max-age=3600', 'content-type': 'application/json' },
    status: 200,
  });
  try {
    const verifier = new JoseAppleIdTokenVerifier();
    const claims = {
      aud: 'com.feizhuicao.app',
      exp: Math.floor(Date.now() / 1_000) + 300,
      iss: 'https://appleid.apple.com',
      sub: 'signed-apple-subject',
    };
    const valid = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'trusted-apple-key' })
      .sign(trusted.privateKey);
    assert.equal((await verifier.verify(valid, 'com.feizhuicao.app')).sub, claims.sub);

    const forgedSignature = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'trusted-apple-key' })
      .sign(attacker.privateKey);
    await assert.rejects(verifier.verify(forgedSignature, 'com.feizhuicao.app'), /invalid_apple_authorization/u);

    const [validHeader, , validSignature] = valid.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ ...claims, sub: 'tampered-subject' })).toString('base64url');
    await assert.rejects(
      verifier.verify(`${validHeader}.${tamperedPayload}.${validSignature}`, 'com.feizhuicao.app'),
      /invalid_apple_authorization/u,
    );

    const wrongKid = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'unknown-apple-key' })
      .sign(trusted.privateKey);
    await assert.rejects(verifier.verify(wrongKid, 'com.feizhuicao.app'), /invalid_apple_authorization/u);

    const wrongAlgorithm = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS512', kid: 'trusted-apple-key' })
      .sign(trusted.privateKey);
    await assert.rejects(verifier.verify(wrongAlgorithm, 'com.feizhuicao.app'), /invalid_apple_authorization/u);

    for (const invalidClaims of [
      { ...claims, aud: 'com.attacker.app' },
      { ...claims, exp: Math.floor(Date.now() / 1_000) - 1 },
      { ...claims, iss: 'https://attacker.example.com' },
    ]) {
      const invalid = await new SignJWT(invalidClaims)
        .setProtectedHeader({ alg: 'RS256', kid: 'trusted-apple-key' })
        .sign(trusted.privateKey);
      await assert.rejects(verifier.verify(invalid, 'com.feizhuicao.app'), /invalid_apple_authorization/u);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Apple authorization codes are exchanged once and only encrypted refresh tokens are persisted', async () => {
  const source = appleSession();
  const rawNonce = 'apple-register-nonce-00000001';
  let exchangeCount = 0;
  const http = {
    exchangeAuthorizationCode: async () => {
      exchangeCount += 1;
      if (exchangeCount > 1) throw new AppleAuthHttpError('invalid_grant');
      return {
        accessToken: 'apple-short-lived-access-token',
        idToken: appleIdToken({ nonce: rawNonce, subject: source.identities[0].subject }),
        refreshToken: 'apple-long-lived-refresh-token',
      };
    },
    revoke: async () => undefined,
  };
  const service = appleService(http);

  await service.registerCredential(source, { authorizationCode: 'single-use-code-1', rawNonce });
  await assert.rejects(
    service.registerCredential(source, { authorizationCode: 'single-use-code-1', rawNonce }),
    /invalid_apple_authorization/u,
  );
  const stored = queryScalar(`
    SELECT status || ':' || (encrypted_refresh_token LIKE 'v1.%')::text
      || ':' || (encrypted_refresh_token LIKE '%apple-long-lived-refresh-token%')::text
    FROM apple_revocable_credentials
    WHERE account_id = '${source.user.id}'
  `);
  assert.equal(stored, 'active:true:false');
});

test('repeated and concurrent Apple registration preserve the active token and deletion revokes every intake', async () => {
  const sequentialSource = appleSession({
    accountId: '50000000-0000-4000-8000-000000000080',
    authUserId: '51000000-0000-4000-8000-000000000080',
    sessionId: '52000000-0000-4000-8000-000000000080',
    subject: 'apple-repeat-active-subject',
  });
  const sequentialRevokes = [];
  const sequentialService = appleService({
    exchangeAuthorizationCode: async ({ authorizationCode }) => {
      const isOld = authorizationCode === 'apple-repeat-old-code';
      const nonce = isOld ? 'apple-repeat-old-nonce' : 'apple-repeat-new-nonce';
      return {
        accessToken: 'temporary-access-token',
        idToken: appleIdToken({ nonce, subject: sequentialSource.identities[0].subject }),
        refreshToken: isOld ? 'apple-repeat-old-refresh-token' : 'apple-repeat-new-refresh-token',
      };
    },
    revoke: async ({ refreshToken }) => { sequentialRevokes.push(refreshToken); },
  });
  await sequentialService.registerCredential(sequentialSource, {
    authorizationCode: 'apple-repeat-old-code',
    rawNonce: 'apple-repeat-old-nonce',
  });
  await sequentialService.registerCredential(sequentialSource, {
    authorizationCode: 'apple-repeat-new-code',
    rawNonce: 'apple-repeat-new-nonce',
  });
  assert.deepEqual(sequentialRevokes, ['apple-repeat-new-refresh-token']);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM apple_revocable_credentials WHERE account_id = '${sequentialSource.user.id}' AND status = 'active'`),
    '1',
  );
  assert.deepEqual(await sequentialService.revokeForAccount(sequentialSource.user.id), { outcome: 'revoked' });
  assert.deepEqual(
    sequentialRevokes,
    ['apple-repeat-new-refresh-token', 'apple-repeat-old-refresh-token'],
    'a repeated registration must compensate the new token without overwriting the original active credential',
  );

  const concurrentSource = appleSession({
    accountId: '50000000-0000-4000-8000-000000000081',
    authUserId: '50000000-0000-4000-8000-000000000081',
    sessionId: '52000000-0000-4000-8000-000000000081',
    subject: 'apple-concurrent-active-subject',
  });
  const authSetup = psql(`
    INSERT INTO auth.users (id) VALUES ('${concurrentSource.authUserId}');
    INSERT INTO auth.sessions (id, user_id) VALUES ('${concurrentSource.sessionId}', '${concurrentSource.authUserId}');
  `);
  assert.equal(authSetup.status, 0, authSetup.stderr);
  await new AccountIdentityService(appleConfig(), { db: serviceDatabase }).resolve(concurrentSource);
  const concurrentRevokes = [];
  const concurrentService = appleService({
    exchangeAuthorizationCode: async ({ authorizationCode }) => {
      const suffix = authorizationCode.endsWith('-a') ? 'a' : 'b';
      return {
        accessToken: 'temporary-access-token',
        idToken: appleIdToken({
          nonce: `apple-concurrent-nonce-${suffix}`,
          subject: concurrentSource.identities[0].subject,
        }),
        refreshToken: `apple-concurrent-refresh-${suffix}`,
      };
    },
    revoke: async ({ refreshToken }) => { concurrentRevokes.push(refreshToken); },
  });
  await Promise.all([
    concurrentService.registerCredential(concurrentSource, {
      authorizationCode: 'apple-concurrent-code-a',
      rawNonce: 'apple-concurrent-nonce-a',
    }),
    concurrentService.registerCredential(concurrentSource, {
      authorizationCode: 'apple-concurrent-code-b',
      rawNonce: 'apple-concurrent-nonce-b',
    }),
  ]);
  assert.equal(concurrentRevokes.length, 1, 'one concurrent intake must be compensated immediately');
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM apple_revocable_credentials WHERE account_id = '${concurrentSource.user.id}' AND status = 'active'`),
    '1',
  );
  const deletion = deletionService({ appleAuth: concurrentService });
  const grant = await deletion.recentAuth.issueVerifiedGrant(concurrentSource, 'apple', 'account_delete');
  const result = await deletion.service.requestDeletion(concurrentSource, {
    confirmation: '注销账号',
    grantId: grant.grantId,
    idempotencyKey: '53000000-0000-4000-8000-000000000081',
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.identityProviderOutcome, 'revoked');
  assert.deepEqual(
    [...concurrentRevokes].sort(),
    ['apple-concurrent-refresh-a', 'apple-concurrent-refresh-b'],
    'deletion must account for both the active credential and every compensating intake',
  );
  assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_credential_intakes WHERE account_id = '${concurrentSource.user.id}'`), '0');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_revocable_credentials WHERE account_id = '${concurrentSource.user.id}'`), '0');

  const retrySource = appleSession({
    accountId: '50000000-0000-4000-8000-000000000082',
    authUserId: '50000000-0000-4000-8000-000000000082',
    sessionId: '52000000-0000-4000-8000-000000000082',
    subject: 'apple-retryable-intake-subject',
  });
  const retryAuthSetup = psql(`
    INSERT INTO auth.users (id) VALUES ('${retrySource.authUserId}');
    INSERT INTO auth.sessions (id, user_id) VALUES ('${retrySource.sessionId}', '${retrySource.authUserId}');
  `);
  assert.equal(retryAuthSetup.status, 0, retryAuthSetup.stderr);
  await new AccountIdentityService(appleConfig(), { db: serviceDatabase }).resolve(retrySource);
  let failFirstNewRevoke = true;
  const retryRevokeAttempts = [];
  const retryService = appleService({
    exchangeAuthorizationCode: async ({ authorizationCode }) => {
      const isOld = authorizationCode === 'apple-retry-old-code';
      const suffix = isOld ? 'old' : 'new';
      return {
        accessToken: 'temporary-access-token',
        idToken: appleIdToken({
          nonce: `apple-retry-${suffix}-nonce`,
          subject: retrySource.identities[0].subject,
        }),
        refreshToken: `apple-retry-${suffix}-refresh`,
      };
    },
    revoke: async ({ refreshToken }) => {
      retryRevokeAttempts.push(refreshToken);
      if (refreshToken === 'apple-retry-new-refresh' && failFirstNewRevoke) {
        failFirstNewRevoke = false;
        throw new AppleAuthHttpError('server_error');
      }
    },
  });
  await retryService.registerCredential(retrySource, {
    authorizationCode: 'apple-retry-old-code',
    rawNonce: 'apple-retry-old-nonce',
  });
  await retryService.registerCredential(retrySource, {
    authorizationCode: 'apple-retry-new-code',
    rawNonce: 'apple-retry-new-nonce',
  });
  assert.equal(
    queryScalar(`SELECT status FROM apple_credential_intakes WHERE account_id = '${retrySource.user.id}'`),
    'retryable',
  );
  const retryDeletion = deletionService({ appleAuth: retryService });
  const retryGrant = await retryDeletion.recentAuth.issueVerifiedGrant(retrySource, 'apple', 'account_delete');
  const retryResult = await retryDeletion.service.requestDeletion(retrySource, {
    confirmation: '注销账号',
    grantId: retryGrant.grantId,
    idempotencyKey: '53000000-0000-4000-8000-000000000082',
  });
  assert.equal(retryResult.status, 'completed');
  assert.equal(retryResult.identityProviderOutcome, 'revoked');
  assert.deepEqual(
    retryRevokeAttempts,
    ['apple-retry-new-refresh', 'apple-retry-new-refresh', 'apple-retry-old-refresh'],
    'deletion must retry a failed intake revocation before revoking the preserved active credential',
  );
  assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_credential_intakes WHERE account_id = '${retrySource.user.id}'`), '0');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_revocable_credentials WHERE account_id = '${retrySource.user.id}'`), '0');
});

test('Apple intake stays unbindable while ID token validation is in flight', async () => {
  const source = appleSession({
    accountId: '50000000-0000-4000-8000-000000000095',
    authUserId: '51000000-0000-4000-8000-000000000095',
    sessionId: '52000000-0000-4000-8000-000000000095',
    subject: 'apple-pending-validation-subject',
  });
  const rawNonce = 'apple-pending-validation-nonce';
  let verifierStarted;
  let releaseVerifier;
  const started = new Promise((resolve) => { verifierStarted = resolve; });
  const release = new Promise((resolve) => { releaseVerifier = resolve; });
  let revokeCount = 0;
  const service = appleService(
    {
      exchangeAuthorizationCode: async () => ({
        accessToken: 'temporary-access-token',
        idToken: appleIdToken({ nonce: rawNonce, subject: source.identities[0].subject }),
        refreshToken: 'pending-validation-refresh-token',
      }),
      revoke: async () => { revokeCount += 1; },
    },
    appleConfig(),
    {
      verify: async (token) => {
        verifierStarted();
        await release;
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      },
    },
  );
  const registration = service.registerCredential(source, {
    authorizationCode: 'pending-validation-code',
    rawNonce,
  });
  await started;
  assert.equal(
    queryScalar(`SELECT status || ':' || (encrypted_refresh_token IS NOT NULL)::text || ':'
      || (lease_token IS NOT NULL)::text
      FROM apple_credential_intakes WHERE account_id = '${source.user.id}'`),
    'pending_validation:true:true',
  );

  await service.retryDueIntakes(new Date(Date.now() + 60_000));
  assert.equal(
    queryScalar(`SELECT status FROM apple_credential_intakes WHERE account_id = '${source.user.id}'`),
    'pending_validation',
    'the retry worker must never bind a token before its ID token is validated',
  );
  assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_revocable_credentials WHERE account_id = '${source.user.id}'`), '0');
  assert.equal(revokeCount, 0);

  releaseVerifier();
  await registration;
  assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_credential_intakes WHERE account_id = '${source.user.id}'`), '0');
  assert.equal(
    queryScalar(`SELECT status FROM apple_revocable_credentials WHERE account_id = '${source.user.id}'`),
    'active',
    'only successful validation may unlock the durable intake for binding',
  );
});

test('expired Apple validation leases are compensated without binding the token', async () => {
  for (const scenario of [
    { expectedStatus: 'revoked', revokeFails: false, suffix: '096' },
    { expectedStatus: 'manual_action_required', revokeFails: true, suffix: '097' },
  ]) {
    const source = appleSession({
      accountId: `50000000-0000-4000-8000-000000000${scenario.suffix}`,
      authUserId: `51000000-0000-4000-8000-000000000${scenario.suffix}`,
      sessionId: `52000000-0000-4000-8000-000000000${scenario.suffix}`,
      subject: `apple-expired-validation-subject-${scenario.suffix}`,
    });
    const rawNonce = `apple-expired-validation-nonce-${scenario.suffix}`;
    let verifierStarted;
    let releaseVerifier;
    const started = new Promise((resolve) => { verifierStarted = resolve; });
    const release = new Promise((resolve) => { releaseVerifier = resolve; });
    let revokeCount = 0;
    const http = {
      exchangeAuthorizationCode: async () => ({
        accessToken: 'temporary-access-token',
        idToken: appleIdToken({ nonce: rawNonce, subject: source.identities[0].subject }),
        refreshToken: `expired-validation-refresh-token-${scenario.suffix}`,
      }),
      revoke: async () => {
        revokeCount += 1;
        if (scenario.revokeFails) throw new AppleAuthHttpError('invalid_grant');
      },
    };
    const registeringService = appleService(http, appleConfig(), {
      verify: async (token) => {
        verifierStarted();
        await release;
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      },
    });
    const registration = registeringService.registerCredential(source, {
      authorizationCode: `expired-validation-code-${scenario.suffix}`,
      rawNonce,
    });
    await started;

    const recoveryWorker = appleService(http);
    await recoveryWorker.retryDueIntakes(new Date(Date.now() + 3 * 60_000));
    assert.equal(revokeCount, 1);
    assert.equal(
      queryScalar(`SELECT status || ':' || (encrypted_refresh_token IS NULL)::text
        FROM apple_credential_intakes WHERE account_id = '${source.user.id}'`),
      `${scenario.expectedStatus}:true`,
      'a process crash after token persistence must converge through revoke or a conservative manual outcome',
    );
    assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_revocable_credentials WHERE account_id = '${source.user.id}'`), '0');

    releaseVerifier();
    await assert.rejects(registration, /apple_credential_persistence_failed/u);
    assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_revocable_credentials WHERE account_id = '${source.user.id}'`), '0');
    assert.equal(revokeCount, 1, 'a late verifier completion must not reclaim or rebind the terminal intake');
  }
});

test('Apple credential registration rejects expired or mismatched aud, nonce, and subject claims', async () => {
  const cases = [
    { label: 'aud', overrides: { audience: 'com.attacker.app' } },
    { label: 'nonce', overrides: { nonce: 'different-nonce-000000000' } },
    { label: 'subject', overrides: { subject: 'different-apple-subject' } },
    { label: 'expiry', overrides: { expiresAt: Math.floor(Date.now() / 1_000) - 1 } },
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const entry = cases[index];
    const suffix = index + 10;
    const source = appleSession({
      accountId: `50000000-0000-4000-8000-0000000000${suffix}`,
      authUserId: `51000000-0000-4000-8000-0000000000${suffix}`,
      sessionId: `52000000-0000-4000-8000-0000000000${suffix}`,
      subject: `apple-claims-subject-${entry.label}`,
    });
    const rawNonce = `apple-claims-nonce-${entry.label}-000000`;
    const http = {
      exchangeAuthorizationCode: async () => ({
        accessToken: 'temporary-access-token',
        idToken: appleIdToken({
          nonce: rawNonce,
          subject: source.identities[0].subject,
          ...entry.overrides,
        }),
        refreshToken: 'must-not-be-stored',
      }),
      revoke: async () => undefined,
    };
    await assert.rejects(
      appleService(http).registerCredential(source, { authorizationCode: `code-${entry.label}-1234`, rawNonce }),
      /invalid_apple_authorization/u,
    );
  }
  const verifierSource = appleSession({
    accountId: '50000000-0000-4000-8000-000000000019',
    authUserId: '51000000-0000-4000-8000-000000000019',
    sessionId: '52000000-0000-4000-8000-000000000019',
    subject: 'apple-verifier-failure-subject',
  });
  const config = appleConfig();
  let verifierFailureRevokes = 0;
  const verifierFailure = new AppleAuthService(
    config,
    {
      exchangeAuthorizationCode: async () => ({
        accessToken: 'temporary-access-token',
        idToken: 'invalid-signed-token',
        refreshToken: 'must-not-be-stored',
      }),
      revoke: async () => { verifierFailureRevokes += 1; },
    },
    { verify: async () => { throw new Error('invalid_signature'); } },
    { db: serviceDatabase },
    new IdentityDigestService(config),
  );
  await assert.rejects(
    verifierFailure.registerCredential(verifierSource, {
      authorizationCode: 'verifier-failure-code',
      rawNonce: 'verifier-failure-nonce',
    }),
    (error) => error?.status === 403 && error?.message === 'invalid_apple_authorization',
  );
  assert.equal(verifierFailureRevokes, 1);
  assert.equal(
    queryScalar(`SELECT status || ':' || (encrypted_refresh_token IS NULL)::text
      FROM apple_credential_intakes WHERE account_id = '${verifierSource.user.id}'`),
    'revoked:true',
    'a verifier rejection must durably revoke the persisted token',
  );
  assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_revocable_credentials WHERE account_id = '${verifierSource.user.id}'`), '0');
});

test('Apple revoke treats only HTTP success as revoked and durably retries every failure class', async () => {
  const failureCodes = ['invalid_grant', 'invalid_client', 'rate_limited', 'server_error'];
  for (let index = 0; index < failureCodes.length; index += 1) {
    const suffix = index + 20;
    const source = appleSession({
      accountId: `50000000-0000-4000-8000-0000000000${suffix}`,
      authUserId: `51000000-0000-4000-8000-0000000000${suffix}`,
      sessionId: `52000000-0000-4000-8000-0000000000${suffix}`,
      subject: `apple-revoke-subject-${failureCodes[index]}`,
    });
    const rawNonce = `apple-revoke-nonce-${failureCodes[index]}-000000`;
    const http = {
      exchangeAuthorizationCode: async () => ({
        accessToken: 'temporary-access-token',
        idToken: appleIdToken({ nonce: rawNonce, subject: source.identities[0].subject }),
        refreshToken: `refresh-${failureCodes[index]}`,
      }),
      revoke: async () => { throw new AppleAuthHttpError(failureCodes[index]); },
    };
    const service = appleService(http);
    await service.registerCredential(source, { authorizationCode: `register-${failureCodes[index]}`, rawNonce });
    const result = await service.revokeForAccount(source.user.id);
    assert.equal(result.outcome, 'retryable');
    assert.equal(
      queryScalar(`SELECT status || ':' || last_error_code FROM apple_revocable_credentials WHERE account_id = '${source.user.id}'`),
      `retryable:${failureCodes[index]}`,
    );
    if (failureCodes[index] === 'invalid_grant') {
      assert.deepEqual(
        await service.revokeForAccount(source.user.id),
        { outcome: 'manual_action_required' },
        'a retried invalid_grant is indeterminate, not proof that Apple revoked the credential',
      );
      assert.equal(
        queryScalar(`SELECT status || ':' || (encrypted_refresh_token IS NULL)::text FROM apple_revocable_credentials WHERE account_id = '${source.user.id}'`),
        'manual_action_required:true',
      );
    }
  }

  const successSource = appleSession({
    accountId: '50000000-0000-4000-8000-000000000030',
    authUserId: '51000000-0000-4000-8000-000000000030',
    sessionId: '52000000-0000-4000-8000-000000000030',
    subject: 'apple-revoke-success-subject',
  });
  const rawNonce = 'apple-revoke-success-nonce-000000';
  let successRevokeCount = 0;
  const successHttp = {
    exchangeAuthorizationCode: async () => ({
      accessToken: 'temporary-access-token',
      idToken: appleIdToken({ nonce: rawNonce, subject: successSource.identities[0].subject }),
      refreshToken: 'successful-refresh-token',
    }),
    revoke: async () => { successRevokeCount += 1; },
  };
  const successService = appleService(successHttp);
  await successService.registerCredential(successSource, { authorizationCode: 'register-success-code', rawNonce });
  assert.deepEqual(await successService.revokeForAccount(successSource.user.id), { outcome: 'revoked' });
  assert.deepEqual(
    await successService.revokeForAccount(successSource.user.id),
    { outcome: 'revoked' },
    'a crash after remote success must resume from the durable revoked marker',
  );
  assert.equal(successRevokeCount, 1);
  assert.equal(
    queryScalar(`SELECT status || ':' || (last_error_code IS NULL)::text FROM apple_revocable_credentials WHERE account_id = '${successSource.user.id}'`),
    'revoked:true',
  );
});

test('Apple credential intake compensates persistence failure and an account-deletion registration race', async () => {
  const persistenceSource = appleSession({
    accountId: '50000000-0000-4000-8000-000000000050',
    authUserId: '51000000-0000-4000-8000-000000000050',
    sessionId: '52000000-0000-4000-8000-000000000050',
    subject: 'apple-intake-persistence-subject',
  });
  const persistenceNonce = 'apple-intake-persistence-nonce';
  let persistenceExchangeCount = 0;
  let persistenceRevokeCount = 0;
  const failureTrigger = psql(`
    CREATE FUNCTION fail_test_apple_intake_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.account_id = '${persistenceSource.user.id}' THEN RAISE EXCEPTION 'simulated_intake_failure'; END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER fail_test_apple_intake_insert
    BEFORE INSERT ON apple_credential_intakes
    FOR EACH ROW EXECUTE FUNCTION fail_test_apple_intake_insert();
  `);
  assert.equal(failureTrigger.status, 0, failureTrigger.stderr);
  const persistenceService = appleService({
    exchangeAuthorizationCode: async () => {
      persistenceExchangeCount += 1;
      return {
        accessToken: 'temporary-access-token',
        idToken: appleIdToken({ nonce: persistenceNonce, subject: persistenceSource.identities[0].subject }),
        refreshToken: 'intake-persistence-raw-refresh-token',
      };
    },
    revoke: async () => {
      persistenceRevokeCount += 1;
      throw new AppleAuthHttpError('server_error');
    },
  });
  await assert.rejects(
    persistenceService.registerCredential(persistenceSource, {
      authorizationCode: 'intake-persistence-code',
      rawNonce: persistenceNonce,
    }),
    /apple_credential_persistence_failed/u,
  );
  const removeFailureTrigger = psql(`
    DROP TRIGGER fail_test_apple_intake_insert ON apple_credential_intakes;
    DROP FUNCTION fail_test_apple_intake_insert();
  `);
  assert.equal(removeFailureTrigger.status, 0, removeFailureTrigger.stderr);
  assert.equal(persistenceExchangeCount, 0, 'Apple exchange must not start until the durable claim commits');
  assert.equal(persistenceRevokeCount, 0);
  assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_credential_intakes WHERE account_id = '${persistenceSource.user.id}'`), '0');

  for (const [index, firstRevokeFails] of [false, true].entries()) {
    const suffix = 60 + index;
    const accountId = `50000000-0000-4000-8000-0000000000${suffix}`;
    const authUserId = accountId;
    const sessionId = `52000000-0000-4000-8000-0000000000${suffix}`;
    const source = appleSession({
      accountId,
      authUserId,
      sessionId,
      subject: `apple-intake-deletion-race-${index}`,
    });
    const authSetup = psql(`
      INSERT INTO auth.users (id) VALUES ('${authUserId}');
      INSERT INTO auth.sessions (id, user_id) VALUES ('${sessionId}', '${authUserId}');
    `);
    assert.equal(authSetup.status, 0, authSetup.stderr);
    await new AccountIdentityService(appleConfig(), { db: serviceDatabase }).resolve(source);
    let exchangeStarted;
    let releaseExchange;
    const started = new Promise((resolve) => { exchangeStarted = resolve; });
    const release = new Promise((resolve) => { releaseExchange = resolve; });
    let revokeStarted;
    let releaseRevoke;
    const revokePending = new Promise((resolve) => { revokeStarted = resolve; });
    const revokeRelease = new Promise((resolve) => { releaseRevoke = resolve; });
    let revokeCount = 0;
    const rawNonce = `apple-intake-deletion-race-nonce-${index}`;
    const rawRefreshToken = `apple-intake-deletion-race-refresh-${index}`;
    const service = appleService({
      exchangeAuthorizationCode: async () => {
        exchangeStarted();
        await release;
        return {
          accessToken: 'temporary-access-token',
          idToken: appleIdToken({ nonce: rawNonce, subject: source.identities[0].subject }),
          refreshToken: rawRefreshToken,
        };
      },
      revoke: async () => {
        revokeCount += 1;
        if (revokeCount === 1) {
          revokeStarted();
          await revokeRelease;
          if (firstRevokeFails) throw new AppleAuthHttpError('server_error');
        }
      },
    });
    const registration = service.registerCredential(source, {
      authorizationCode: `deletion-race-code-${index}`,
      rawNonce,
    });
    await started;
    assert.equal(
      queryScalar(`SELECT status || ':' || (encrypted_refresh_token IS NULL)::text
        FROM apple_credential_intakes WHERE account_id = '${accountId}'`),
      'pending_exchange:true',
      'the durable exchange claim must exist before the HTTP response is released',
    );
    const deletion = deletionService({ appleAuth: service });
    const grant = await deletion.recentAuth.issueVerifiedGrant(source, 'apple', 'account_delete');
    const blocked = await deletion.service.requestDeletion(source, {
      confirmation: '注销账号',
      grantId: grant.grantId,
      idempotencyKey: `53000000-0000-4000-8000-0000000000${suffix}`,
    });
    assert.equal(blocked.status, 'retryable');
    assert.equal(queryScalar(`SELECT status FROM accounts WHERE id = '${accountId}'`), 'deleting');
    assert.equal(queryScalar(`SELECT status FROM apple_credential_intakes WHERE account_id = '${accountId}'`), 'pending_exchange');

    releaseExchange();
    await revokePending;
    assert.equal(
      queryScalar(`SELECT status || ':' || (encrypted_refresh_token IS NULL)::text
        FROM apple_credential_intakes WHERE account_id = '${accountId}'`),
      'revoke_pending:false',
      'the exchanged token must be durable before compensation HTTP begins',
    );
    const duringCompensation = await deletion.service.processJob(
      blocked.jobId,
      new Date(Date.now() + 70_000),
    );
    assert.equal(duringCompensation.status, 'retryable');
    assert.equal(queryScalar(`SELECT status FROM apple_credential_intakes WHERE account_id = '${accountId}'`), 'revoke_pending');

    releaseRevoke();
    await assert.rejects(registration, /account_not_active/u);
    assert.equal(
      queryScalar(`SELECT status || ':' || (encrypted_refresh_token IS NULL)::text || ':'
        || COALESCE((encrypted_refresh_token LIKE '%${rawRefreshToken}%')::text, 'false')
        FROM apple_credential_intakes WHERE account_id = '${accountId}'`),
      firstRevokeFails ? 'retryable:false:false' : 'revoked:true:false',
    );
    const completed = await deletion.service.processJob(
      blocked.jobId,
      new Date(Date.now() + 4 * 60_000),
    );
    assert.equal(completed.status, 'completed');
    assert.equal(completed.identityProviderOutcome, 'revoked');
    assert.equal(revokeCount, firstRevokeFails ? 2 : 1);
    assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_credential_intakes WHERE account_id = '${accountId}'`), '0');
    assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_revocable_credentials WHERE account_id = '${accountId}'`), '0');
    if (index === 0) {
      let lateExchangeCount = 0;
      const lateService = appleService({
        exchangeAuthorizationCode: async () => {
          lateExchangeCount += 1;
          throw new Error('must_not_exchange');
        },
        revoke: async () => undefined,
      });
      await assert.rejects(
        lateService.registerCredential(source, {
          authorizationCode: 'late-after-deletion-code',
          rawNonce,
        }),
        /account_not_active/u,
      );
      assert.equal(lateExchangeCount, 0, 'a deleted account must fail before Apple exchange');
      assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_credential_intakes WHERE account_id = '${accountId}'`), '0');
    }
  }
});

test('expired Apple exchange claims become durable manual outcomes and allow deletion to close', async () => {
  const accountId = '50000000-0000-4000-8000-000000000090';
  const sessionId = '52000000-0000-4000-8000-000000000090';
  const source = appleSession({
    accountId,
    authUserId: accountId,
    sessionId,
    subject: 'apple-expired-exchange-claim-subject',
  });
  const authSetup = psql(`
    INSERT INTO auth.users (id) VALUES ('${accountId}');
    INSERT INTO auth.sessions (id, user_id) VALUES ('${sessionId}', '${accountId}');
  `);
  assert.equal(authSetup.status, 0, authSetup.stderr);
  await new AccountIdentityService(appleConfig(), { db: serviceDatabase }).resolve(source);
  const setup = psql(`
    INSERT INTO apple_credential_intakes (
      id, account_id, auth_user_id, subject_digest, subject_digest_aliases,
      status, lease_token, lease_until, retention_at
    ) VALUES (
      '50000000-0000-4000-8000-000000000091', '${accountId}', '${accountId}',
      '${'9'.repeat(64)}', '[]'::jsonb, 'pending_exchange',
      '50000000-0000-4000-8000-000000000092', now() - interval '1 second',
      now() + interval '183 days'
    );
  `);
  assert.equal(setup.status, 0, setup.stderr);
  const service = appleService({
    exchangeAuthorizationCode: async () => { throw new Error('unused'); },
    revoke: async () => undefined,
  });
  await service.retryDueIntakes();
  assert.equal(
    queryScalar(`SELECT status || ':' || last_error_code || ':' || (encrypted_refresh_token IS NULL)::text
      FROM apple_credential_intakes WHERE account_id = '${accountId}'`),
    'manual_action_required:exchange_claim_expired:true',
  );
  assert.equal(
    queryScalar(`SELECT outcome || ':' || (metadata->>'manualActionRequired')
      FROM account_security_events WHERE event_type = 'apple_exchange_claim_expired'
      ORDER BY created_at DESC LIMIT 1`),
    'failed:true',
  );

  const deletion = deletionService({ appleAuth: service });
  const grant = await deletion.recentAuth.issueVerifiedGrant(source, 'apple', 'account_delete');
  const result = await deletion.service.requestDeletion(source, {
    confirmation: '注销账号',
    grantId: grant.grantId,
    idempotencyKey: '53000000-0000-4000-8000-000000000090',
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.identityProviderOutcome, 'manual_action_required');
  assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_credential_intakes WHERE account_id = '${accountId}'`), '0');
});

test('deletion reopens provider cutover when an intake becomes unresolved after the provider snapshot', async () => {
  const accountId = '50000000-0000-4000-8000-000000000093';
  const sessionId = '52000000-0000-4000-8000-000000000093';
  const source = appleSession({
    accountId,
    authUserId: accountId,
    sessionId,
    subject: 'apple-finalize-cutover-subject',
  });
  const authSetup = psql(`
    INSERT INTO auth.users (id) VALUES ('${accountId}');
    INSERT INTO auth.sessions (id, user_id) VALUES ('${sessionId}', '${accountId}');
  `);
  assert.equal(authSetup.status, 0, authSetup.stderr);
  await new AccountIdentityService(appleConfig(), { db: serviceDatabase }).resolve(source);
  const setup = psql(`
    INSERT INTO apple_credential_intakes (
      id, account_id, auth_user_id, subject_digest, subject_digest_aliases,
      status, retention_at, revoked_at
    ) VALUES (
      '50000000-0000-4000-8000-000000000094', '${accountId}', '${accountId}',
      '${'8'.repeat(64)}', '[]'::jsonb, 'revoked', now() + interval '183 days', now()
    );
  `);
  assert.equal(setup.status, 0, setup.stderr);
  let providerCalls = 0;
  const deletion = deletionService({
    appleAuth: {
      revokeForAccount: async () => {
        providerCalls += 1;
        const transition = providerCalls === 1
          ? psql(`UPDATE apple_credential_intakes SET status = 'retryable', last_error_code = 'late_cutover'
              WHERE account_id = '${accountId}';`)
          : psql(`UPDATE apple_credential_intakes SET status = 'manual_action_required',
              encrypted_refresh_token = NULL, last_error_code = 'late_cutover_manual'
              WHERE account_id = '${accountId}';`);
        assert.equal(transition.status, 0, transition.stderr);
        return { outcome: 'manual_action_required' };
      },
    },
  });
  const grant = await deletion.recentAuth.issueVerifiedGrant(source, 'apple', 'account_delete');
  const first = await deletion.service.requestDeletion(source, {
    confirmation: '注销账号',
    grantId: grant.grantId,
    idempotencyKey: '53000000-0000-4000-8000-000000000093',
  });
  assert.equal(first.status, 'retryable');
  assert.equal(first.identityProviderOutcome, 'pending');
  assert.equal(queryScalar(`SELECT status FROM apple_credential_intakes WHERE account_id = '${accountId}'`), 'retryable');
  assert.equal(
    queryScalar(`SELECT (identity_providers_revoked_at IS NULL)::text || ':' || last_error_code
      FROM account_deletion_jobs WHERE id = '${first.jobId}'`),
    'true:apple_credential_state_unresolved',
  );
  const completed = await deletion.service.processJob(first.jobId, new Date(Date.now() + 2 * 60_000));
  assert.equal(completed.status, 'completed');
  assert.equal(completed.identityProviderOutcome, 'manual_action_required');
  assert.equal(providerCalls, 2);
  assert.equal(queryScalar(`SELECT COUNT(*) FROM apple_credential_intakes WHERE account_id = '${accountId}'`), '0');
});

test('Apple revoke lease fencing survives marker crashes and two-worker HTTP races', async () => {
  const crashSource = appleSession({
    accountId: '50000000-0000-4000-8000-000000000070',
    authUserId: '51000000-0000-4000-8000-000000000070',
    sessionId: '52000000-0000-4000-8000-000000000070',
    subject: 'apple-revoke-marker-crash-subject',
  });
  const crashNonce = 'apple-revoke-marker-crash-nonce';
  let crashRevokeCalls = 0;
  const crashService = appleService({
    exchangeAuthorizationCode: async () => ({
      accessToken: 'temporary-access-token',
      idToken: appleIdToken({ nonce: crashNonce, subject: crashSource.identities[0].subject }),
      refreshToken: 'apple-marker-crash-refresh-token',
    }),
    revoke: async () => {
      crashRevokeCalls += 1;
      if (crashRevokeCalls > 1) throw new AppleAuthHttpError('invalid_grant');
    },
  });
  await crashService.registerCredential(crashSource, { authorizationCode: 'marker-crash-code', rawNonce: crashNonce });
  const markerFailure = psql(`
    CREATE FUNCTION fail_test_apple_revoked_marker() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.account_id = '${crashSource.user.id}' AND NEW.status = 'revoked' THEN
        RAISE EXCEPTION 'simulated_revoked_marker_crash';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER fail_test_apple_revoked_marker
    BEFORE UPDATE ON apple_revocable_credentials
    FOR EACH ROW EXECUTE FUNCTION fail_test_apple_revoked_marker();
  `);
  assert.equal(markerFailure.status, 0, markerFailure.stderr);
  const crashAt = new Date();
  await assert.rejects(
    crashService.revokeForAccount(crashSource.user.id, crashAt),
    (error) => error?.cause?.message === 'simulated_revoked_marker_crash',
  );
  const removeMarkerFailure = psql(`
    DROP TRIGGER fail_test_apple_revoked_marker ON apple_revocable_credentials;
    DROP FUNCTION fail_test_apple_revoked_marker();
  `);
  assert.equal(removeMarkerFailure.status, 0, removeMarkerFailure.stderr);
  assert.equal(queryScalar(`SELECT status || ':' || revoke_attempt_count::text FROM apple_revocable_credentials WHERE account_id = '${crashSource.user.id}'`), 'revoke_pending:1');
  assert.deepEqual(
    await crashService.revokeForAccount(crashSource.user.id, new Date(crashAt.getTime() + 3 * 60 * 1_000)),
    { outcome: 'manual_action_required' },
  );
  assert.equal(queryScalar(`SELECT status || ':' || (encrypted_refresh_token IS NULL)::text FROM apple_revocable_credentials WHERE account_id = '${crashSource.user.id}'`), 'manual_action_required:true');

  const raceSource = appleSession({
    accountId: '50000000-0000-4000-8000-000000000071',
    authUserId: '51000000-0000-4000-8000-000000000071',
    sessionId: '52000000-0000-4000-8000-000000000071',
    subject: 'apple-revoke-two-worker-subject',
  });
  const raceNonce = 'apple-revoke-two-worker-nonce';
  let firstStarted;
  let releaseFirst;
  const started = new Promise((resolve) => { firstStarted = resolve; });
  const release = new Promise((resolve) => { releaseFirst = resolve; });
  const firstService = appleService({
    exchangeAuthorizationCode: async () => ({
      accessToken: 'temporary-access-token',
      idToken: appleIdToken({ nonce: raceNonce, subject: raceSource.identities[0].subject }),
      refreshToken: 'apple-two-worker-refresh-token',
    }),
    revoke: async () => { firstStarted(); await release; },
  });
  await firstService.registerCredential(raceSource, { authorizationCode: 'two-worker-code', rawNonce: raceNonce });
  const raceAt = new Date();
  const firstAttempt = firstService.revokeForAccount(raceSource.user.id, raceAt);
  await started;
  const secondService = appleService({
    exchangeAuthorizationCode: async () => { throw new Error('unused'); },
    revoke: async () => { throw new AppleAuthHttpError('invalid_grant'); },
  });
  assert.deepEqual(
    await secondService.revokeForAccount(raceSource.user.id, new Date(raceAt.getTime() + 3 * 60 * 1_000)),
    { outcome: 'manual_action_required' },
  );
  releaseFirst();
  assert.deepEqual(await firstAttempt, { outcome: 'manual_action_required' });
  assert.equal(queryScalar(`SELECT status || ':' || revoke_attempt_count::text || ':' || (revoke_lease_token IS NULL)::text FROM apple_revocable_credentials WHERE account_id = '${raceSource.user.id}'`), 'manual_action_required:2:true');
});

test('a revoked Apple subject can register again only by fully replacing credential state', async () => {
  const oldSource = appleSession({
    accountId: '50000000-0000-4000-8000-000000000040',
    authUserId: '51000000-0000-4000-8000-000000000040',
    sessionId: '52000000-0000-4000-8000-000000000040',
    subject: 'apple-reregister-subject',
  });
  const rawNonce = 'apple-reregister-old-nonce-000000';
  const http = {
    exchangeAuthorizationCode: async ({ authorizationCode }) => ({
      accessToken: 'temporary-access-token',
      idToken: appleIdToken({
        nonce: authorizationCode.startsWith('old') ? rawNonce : 'apple-reregister-new-nonce-000000',
        subject: oldSource.identities[0].subject,
      }),
      refreshToken: authorizationCode.startsWith('old') ? 'old-refresh-token' : 'new-refresh-token',
    }),
    revoke: async () => undefined,
  };
  const service = appleService(http);
  await service.registerCredential(oldSource, { authorizationCode: 'old-code-1234', rawNonce });
  await service.revokeForAccount(oldSource.user.id);

  const newSource = appleSession({
    accountId: '50000000-0000-4000-8000-000000000041',
    authUserId: '51000000-0000-4000-8000-000000000041',
    sessionId: '52000000-0000-4000-8000-000000000041',
    subject: oldSource.identities[0].subject,
  });
  await service.registerCredential(newSource, {
    authorizationCode: 'new-code-1234',
    rawNonce: 'apple-reregister-new-nonce-000000',
  });
  assert.equal(
    queryScalar(`
      SELECT account_id::text || ':' || auth_user_id::text || ':' || status || ':'
        || revoke_attempt_count::text || ':' || (last_error_code IS NULL)::text || ':'
        || (revoked_at IS NULL)::text || ':' || (next_retry_at IS NULL)::text
      FROM apple_revocable_credentials
      WHERE subject_digest = (
        SELECT subject_digest FROM apple_revocable_credentials WHERE account_id = '${newSource.user.id}'
      )
    `),
    `${newSource.user.id}:${newSource.authUserId}:active:0:true:true:true`,
  );
});

test('deferred commerce constraints enforce reservation transitions and batch accounting', () => {
  const accountId = '00000000-0000-4000-8000-000000000001';
  const batchOne = '10000000-0000-4000-8000-000000000001';
  const batchTwo = '10000000-0000-4000-8000-000000000002';
  const reservationOne = '20000000-0000-4000-8000-000000000001';
  const reserveForSettlement = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, reserved_points, available_at, status
    ) VALUES
      ('${batchOne}', 'production', '${accountId}', '${accountId}', 'trial', 'db-test-batch-1',
       'ai-points-v1', 0, 100, 4, now(), 'available'),
      ('${batchTwo}', 'production', '${accountId}', '${accountId}', 'trial', 'db-test-batch-2',
       'ai-points-v1', 0, 100, 6, now(), 'available');
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES (
      '${reservationOne}', 'production', '${accountId}', 'db-test-valid', 'transcription_opi',
      'ai-points-v1', 10, 'reserved'
    );
    INSERT INTO ai_point_reservation_allocations (
      environment, account_id, reservation_id, batch_id, points
    ) VALUES
      ('production', '${accountId}', '${reservationOne}', '${batchOne}', 4),
      ('production', '${accountId}', '${reservationOne}', '${batchTwo}', 6);
    COMMIT;
  `);
  assert.equal(reserveForSettlement.status, 0, reserveForSettlement.stderr);

  const settle = psql(`
    BEGIN;
    UPDATE ai_point_reservations
    SET status = 'settled', settled_at = now()
    WHERE id = '${reservationOne}';
    UPDATE ai_point_batches
    SET reserved_points = 0,
        consumed_points = CASE id WHEN '${batchOne}' THEN 4 ELSE 6 END
    WHERE id IN ('${batchOne}', '${batchTwo}');
    INSERT INTO ai_point_ledger_entries (
      environment, account_id, batch_id, reservation_id, operation_id, entry_type, direction, points
    ) VALUES
      ('production', '${accountId}', '${batchOne}', '${reservationOne}', 'db-test-valid', 'settle', 'neutral', 4),
      ('production', '${accountId}', '${batchTwo}', '${reservationOne}', 'db-test-valid', 'settle', 'neutral', 6);
    COMMIT;
  `);
  assert.equal(settle.status, 0, settle.stderr);
  assert.equal(
    queryScalar(`SELECT status || ':' || (settled_at IS NOT NULL)::text FROM ai_point_reservations WHERE id = '${reservationOne}'`),
    'settled:true',
  );
  assert.equal(
    queryScalar(`SELECT SUM(consumed_points)::text || ':' || SUM(reserved_points)::text FROM ai_point_batches WHERE id IN ('${batchOne}', '${batchTwo}')`),
    '10:0',
  );

  const idempotentSettle = psql(`
    UPDATE ai_point_reservations SET status = 'settled' WHERE id = '${reservationOne}';
  `);
  assert.equal(idempotentSettle.status, 0, idempotentSettle.stderr);

  const illegalTerminalTransition = psql(`
    BEGIN;
    UPDATE ai_point_reservations
    SET status = 'released', settled_at = NULL, released_at = now()
    WHERE id = '${reservationOne}';
    COMMIT;
  `);
  assert.notEqual(illegalTerminalTransition.status, 0);
  assert.match(illegalTerminalTransition.stderr, /commerce_reservation_transition_invalid/);
  assert.equal(
    queryScalar(`SELECT status FROM ai_point_reservations WHERE id = '${reservationOne}'`),
    'settled',
    'an illegal terminal transition must roll back',
  );

  const releaseBatch = '10000000-0000-4000-8000-000000000005';
  const releaseReservation = '20000000-0000-4000-8000-000000000005';
  const validRelease = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, reserved_points, available_at, status
    ) VALUES (
      '${releaseBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'db-test-release', 'ai-points-v1', 0, 100, 5, now(), 'available'
    );
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES (
      '${releaseReservation}', 'production', '${accountId}', 'db-test-release',
      'transcription', 'ai-points-v1', 5, 'reserved'
    );
    INSERT INTO ai_point_reservation_allocations VALUES (
      'production', '${accountId}', '${releaseReservation}', '${releaseBatch}', 5
    );
    COMMIT;
    BEGIN;
    UPDATE ai_point_reservations
    SET status = 'released', released_at = now()
    WHERE id = '${releaseReservation}';
    UPDATE ai_point_batches SET reserved_points = 0 WHERE id = '${releaseBatch}';
    INSERT INTO ai_point_ledger_entries (
      environment, account_id, batch_id, reservation_id, operation_id, entry_type, direction, points
    ) VALUES (
      'production', '${accountId}', '${releaseBatch}', '${releaseReservation}',
      'db-test-release', 'release', 'credit', 5
    );
    COMMIT;
  `);
  assert.equal(validRelease.status, 0, validRelease.stderr);
  assert.equal(
    queryScalar(`SELECT reservation.status || ':' || batch.reserved_points::text || ':' || batch.consumed_points::text FROM ai_point_reservations reservation JOIN ai_point_batches batch ON batch.id = '${releaseBatch}' WHERE reservation.id = '${releaseReservation}'`),
    'released:0:0',
  );

  const noConsumedBatch = '10000000-0000-4000-8000-000000000006';
  const noConsumedReservation = '20000000-0000-4000-8000-000000000006';
  const reserveBeforeInvalidSettle = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, reserved_points, available_at, status
    ) VALUES (
      '${noConsumedBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'db-test-no-consumed-settle', 'ai-points-v1', 0, 100, 5, now(), 'available'
    );
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES (
      '${noConsumedReservation}', 'production', '${accountId}', 'db-test-no-consumed-settle',
      'transcription', 'ai-points-v1', 5, 'reserved'
    );
    INSERT INTO ai_point_reservation_allocations VALUES (
      'production', '${accountId}', '${noConsumedReservation}', '${noConsumedBatch}', 5
    );
    COMMIT;
  `);
  assert.equal(reserveBeforeInvalidSettle.status, 0, reserveBeforeInvalidSettle.stderr);
  const settleWithoutConsumed = psql(`
    BEGIN;
    UPDATE ai_point_reservations
    SET status = 'settled', settled_at = now()
    WHERE id = '${noConsumedReservation}';
    UPDATE ai_point_batches SET reserved_points = 0 WHERE id = '${noConsumedBatch}';
    COMMIT;
  `);
  assert.notEqual(settleWithoutConsumed.status, 0);
  assert.match(settleWithoutConsumed.stderr, /commerce_batch_consumed_total_mismatch/);
  assert.equal(
    queryScalar(`SELECT reservation.status || ':' || batch.reserved_points::text || ':' || batch.consumed_points::text FROM ai_point_reservations reservation JOIN ai_point_batches batch ON batch.id = '${noConsumedBatch}' WHERE reservation.id = '${noConsumedReservation}'`),
    'reserved:5:0',
    'a settle that does not transfer reserved points to consumed must roll back',
  );

  const mergedTrialBatch = '10000000-0000-4000-8000-000000000007';
  const mergedTargetDebitBatch = '10000000-0000-4000-8000-000000000009';
  const mergedSourceDebitBatch = '10000000-0000-4000-8000-000000000010';
  const sourceAccountId = '00000000-0000-4000-8000-000000000002';
  const validCarriedConsumption = psql(trialMergeTransaction({
    creditBatchId: mergedTrialBatch,
    creditPoints: 100,
    label: 'db-test-no-consumption-merge',
    sourceAccountId,
    sourceBatchId: mergedSourceDebitBatch,
    sourceConsumed: 0,
    sourceReservationId: '20000000-0000-4000-8000-000000000010',
    targetAccountId: accountId,
    targetBatchId: mergedTargetDebitBatch,
    targetConsumed: 0,
    targetReservationId: '20000000-0000-4000-8000-000000000009',
  }));
  assert.equal(validCarriedConsumption.status, 0, validCarriedConsumption.stderr);
  assert.equal(
    queryScalar(`
      SELECT
        SUM(points) FILTER (WHERE entry_type = 'merge_debit')::text || ':' ||
        SUM(points) FILTER (WHERE entry_type = 'merge_credit')::text || ':' ||
        COUNT(*) FILTER (WHERE entry_type = 'merge_credit')::text
      FROM ai_point_ledger_entries
      WHERE operation_id = 'trial-merge:${accountId}:${sourceAccountId}'
    `),
    '200:100:1',
  );

  const partialTargetAccountId = '00000000-0000-4000-8000-000000000011';
  const partialSourceAccountId = '00000000-0000-4000-8000-000000000012';
  const partialTargetBatch = '10000000-0000-4000-8000-000000000012';
  const partialSourceBatch = '10000000-0000-4000-8000-000000000013';
  const partialCreditBatch = '10000000-0000-4000-8000-000000000014';
  const exactPartialMerge = psql(trialMergeTransaction({
    creditBatchId: partialCreditBatch,
    creditPoints: 50,
    label: 'db-test-partial-consumption-merge',
    sourceAccountId: partialSourceAccountId,
    sourceBatchId: partialSourceBatch,
    sourceConsumed: 30,
    sourceReservationId: '20000000-0000-4000-8000-000000000013',
    targetAccountId: partialTargetAccountId,
    targetBatchId: partialTargetBatch,
    targetConsumed: 20,
    targetReservationId: '20000000-0000-4000-8000-000000000012',
  }));
  assert.equal(exactPartialMerge.status, 0, exactPartialMerge.stderr);
  assert.equal(
    queryScalar(`
      SELECT
        SUM(points) FILTER (WHERE entry_type = 'merge_debit')::text || ':' ||
        SUM(points) FILTER (WHERE entry_type = 'merge_credit')::text || ':' ||
        batch.consumed_points::text
      FROM ai_point_ledger_entries ledger
      JOIN ai_point_batches batch ON batch.id = '${partialCreditBatch}'
      WHERE ledger.operation_id = 'trial-merge:${partialTargetAccountId}:${partialSourceAccountId}'
      GROUP BY batch.consumed_points
    `),
    '150:50:50',
  );

  const wrongCreditTargetAccountId = '00000000-0000-4000-8000-000000000021';
  const wrongCreditSourceAccountId = '00000000-0000-4000-8000-000000000022';
  const fabricatedCredit = psql(trialMergeTransaction({
    creditBatchId: '10000000-0000-4000-8000-000000000017',
    creditPoints: 100,
    label: 'db-test-fabricated-credit',
    sourceAccountId: wrongCreditSourceAccountId,
    sourceBatchId: '10000000-0000-4000-8000-000000000016',
    sourceConsumed: 50,
    sourceReservationId: '20000000-0000-4000-8000-000000000016',
    targetAccountId: wrongCreditTargetAccountId,
    targetBatchId: '10000000-0000-4000-8000-000000000015',
    targetConsumed: 50,
    targetReservationId: '20000000-0000-4000-8000-000000000015',
  }));
  assert.notEqual(fabricatedCredit.status, 0);
  assert.match(fabricatedCredit.stderr, /commerce_merge_conservation_invalid/);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_batches WHERE account_id = '${wrongCreditTargetAccountId}'`),
    '0',
    'a merge credit larger than the exact post-consumption balance must roll back',
  );

  const duplicateCreditBatch = '10000000-0000-4000-8000-000000000018';
  const duplicateCredit = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, consumed_points, available_at, status
    ) VALUES (
      '${duplicateCreditBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'merge:${accountId}:${sourceAccountId}', 'ai-points-v1', 1, 100, 0, now(), 'available'
    );
    INSERT INTO ai_point_ledger_entries (
      environment, account_id, batch_id, operation_id, entry_type, direction, points
    ) VALUES (
      'production', '${accountId}', '${duplicateCreditBatch}',
      'trial-merge:${accountId}:${sourceAccountId}', 'merge_credit', 'credit', 100
    );
    COMMIT;
  `);
  assert.notEqual(duplicateCredit.status, 0);
  assert.match(duplicateCredit.stderr, /ai_point_ledger_merge_credit_operation/);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_batches WHERE id = '${duplicateCreditBatch}'`),
    '0',
    'a second target credit batch for one merge operation must roll back',
  );

  const reusedDebitCreditBatch = '10000000-0000-4000-8000-000000000019';
  const reusedDebit = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, consumed_points, available_at, status
    ) VALUES (
      '${reusedDebitCreditBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'merge:${accountId}:00000000-0000-4000-8000-000000000003',
      'ai-points-v1', 0, 100, 0, now(), 'available'
    );
    INSERT INTO ai_point_ledger_entries (
      environment, account_id, batch_id, operation_id, entry_type, direction, points
    ) VALUES
      ('production', '${accountId}', '${mergedTargetDebitBatch}',
       'trial-merge:${accountId}:00000000-0000-4000-8000-000000000003', 'merge_debit', 'debit', 100),
      ('production', '${accountId}', '${mergedSourceDebitBatch}',
       'trial-merge:${accountId}:00000000-0000-4000-8000-000000000003', 'merge_debit', 'debit', 100),
      ('production', '${accountId}', '${reusedDebitCreditBatch}',
       'trial-merge:${accountId}:00000000-0000-4000-8000-000000000003', 'merge_credit', 'credit', 100);
    COMMIT;
  `);
  assert.notEqual(reusedDebit.status, 0);
  assert.match(reusedDebit.stderr, /ai_point_ledger_merge_debit_batch/);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_batches WHERE id = '${reusedDebitCreditBatch}'`),
    '0',
    'a debit batch already consumed by one credit operation must not back another credit',
  );

  const unbackedMergeBatch = '10000000-0000-4000-8000-000000000011';
  const unbackedMergeCredit = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, consumed_points, available_at, status
    ) VALUES (
      '${unbackedMergeBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'merge:${accountId}:00000000-0000-4000-8000-000000000003',
      'ai-points-v1', 0, 100, 0, now(), 'available'
    );
    INSERT INTO ai_point_ledger_entries (
      environment, account_id, batch_id, operation_id, entry_type, direction, points
    ) VALUES (
      'production', '${accountId}', '${unbackedMergeBatch}',
      'trial-merge:${accountId}:00000000-0000-4000-8000-000000000003',
      'merge_credit', 'credit', 100
    );
    COMMIT;
  `);
  assert.notEqual(unbackedMergeCredit.status, 0);
  assert.match(unbackedMergeCredit.stderr, /commerce_merge_conservation_invalid/);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_batches WHERE id = '${unbackedMergeBatch}'`),
    '0',
    'an unbacked merge credit must roll back its fabricated target batch',
  );

  const invalidReservation = '20000000-0000-4000-8000-000000000002';
  const invalidReservationBatch = '10000000-0000-4000-8000-000000000003';
  const reservationMismatch = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, reserved_points, available_at, status
    ) VALUES (
      '${invalidReservationBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'db-test-invalid-reservation', 'ai-points-v1', 0, 100, 9, now(), 'available'
    );
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES (
      '${invalidReservation}', 'production', '${accountId}', 'db-test-invalid-reservation',
      'transcription_opi', 'ai-points-v1', 10, 'reserved'
    );
    INSERT INTO ai_point_reservation_allocations VALUES (
      'production', '${accountId}', '${invalidReservation}', '${invalidReservationBatch}', 9
    );
    COMMIT;
  `);
  assert.notEqual(reservationMismatch.status, 0);
  assert.match(reservationMismatch.stderr, /commerce_reservation_allocation_total_mismatch/);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_reservations WHERE id = '${invalidReservation}'`),
    '0',
    'failed deferred reservation commit must roll back every row',
  );

  const invalidBatchReservation = '20000000-0000-4000-8000-000000000003';
  const invalidBatch = '10000000-0000-4000-8000-000000000004';
  const batchMismatch = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, reserved_points, available_at, status
    ) VALUES (
      '${invalidBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'db-test-invalid-batch', 'ai-points-v1', 0, 100, 9, now(), 'available'
    );
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES (
      '${invalidBatchReservation}', 'production', '${accountId}', 'db-test-invalid-batch',
      'transcription_opi', 'ai-points-v1', 10, 'reserved'
    );
    INSERT INTO ai_point_reservation_allocations VALUES (
      'production', '${accountId}', '${invalidBatchReservation}', '${invalidBatch}', 10
    );
    COMMIT;
  `);
  assert.notEqual(batchMismatch.status, 0);
  assert.match(batchMismatch.stderr, /commerce_batch_reserved_total_mismatch/);
  assert.equal(
    queryScalar(`SELECT COUNT(*) FROM ai_point_batches WHERE id = '${invalidBatch}'`),
    '0',
    'failed deferred batch commit must roll back every row',
  );

  const invalidTimestampBatch = '10000000-0000-4000-8000-000000000008';
  const invalidTimestampReservation = '20000000-0000-4000-8000-000000000008';
  const timestampSetup = psql(`
    BEGIN;
    INSERT INTO ai_point_batches (
      id, environment, account_id, original_account_id, source_type, source_reference,
      rule_version, ordinal, granted_points, reserved_points, available_at, status
    ) VALUES (
      '${invalidTimestampBatch}', 'production', '${accountId}', '${accountId}', 'trial',
      'db-test-invalid-timestamp', 'ai-points-v1', 0, 100, 5, now(), 'available'
    );
    INSERT INTO ai_point_reservations (
      id, environment, account_id, operation_id, capability, rule_version, points, status
    ) VALUES (
      '${invalidTimestampReservation}', 'production', '${accountId}', 'db-test-invalid-timestamp',
      'transcription', 'ai-points-v1', 5, 'reserved'
    );
    INSERT INTO ai_point_reservation_allocations VALUES (
      'production', '${accountId}', '${invalidTimestampReservation}', '${invalidTimestampBatch}', 5
    );
    COMMIT;
  `);
  assert.equal(timestampSetup.status, 0, timestampSetup.stderr);
  const invalidTimestamp = psql(`
    BEGIN;
    UPDATE ai_point_reservations
    SET status = 'settled', settled_at = created_at - interval '1 second'
    WHERE id = '${invalidTimestampReservation}';
    UPDATE ai_point_batches
    SET reserved_points = 0, consumed_points = 5
    WHERE id = '${invalidTimestampBatch}';
    COMMIT;
  `);
  assert.notEqual(invalidTimestamp.status, 0);
  assert.match(invalidTimestamp.stderr, /commerce_reservation_settled_timestamp_invalid/);
  assert.equal(
    queryScalar(`SELECT status FROM ai_point_reservations WHERE id = '${invalidTimestampReservation}'`),
    'reserved',
  );

  const invalidDirection = psql(`
    INSERT INTO ai_point_ledger_entries (
      environment, account_id, batch_id, operation_id, entry_type, direction, points
    ) VALUES (
      'production', '${accountId}', '${batchOne}', 'db-test-invalid-direction', 'grant', 'debit', 1
    );
  `);
  assert.notEqual(invalidDirection.status, 0);
  assert.match(invalidDirection.stderr, /ai_point_ledger_entry_direction_pair_check/);
});

function verifiedCommerceTransaction({
  accountId,
  environment = 'production',
  productId = 'com.readyoufife.ios.membership.7d.v1',
  purchaseDate = new Date(Date.now() - 1_000),
  revocationDate,
  signedDate = purchaseDate,
  transactionId,
}) {
  return {
    environment,
    transactionId,
    originalTransactionId: `original-${transactionId}`,
    productId,
    bundleId: 'com.readyoufife.ios',
    appAccountToken: accountId,
    purchaseDate,
    signedDate,
    revocationDate,
    productType: 'non_renewing_subscription',
    quantity: 1,
    signedPayloadHash: createHash('sha256')
      .update(`${environment}:${transactionId}:${productId}:${signedDate.toISOString()}:${revocationDate?.toISOString() ?? ''}`)
      .digest('hex'),
    decodedPayload: { environment, productId, transactionId },
  };
}

function verifiedCommerceNotification({
  environment = 'production',
  notificationType,
  notificationUuid,
  signedDate = new Date(),
  transaction,
}) {
  return {
    environment,
    notificationUuid,
    notificationType,
    signedDate,
    signedPayloadHash: createHash('sha256')
      .update(`${environment}:${notificationUuid}:${notificationType}`)
      .digest('hex'),
    decodedPayload: { environment, notificationType, notificationUuid },
    transaction,
  };
}

function persistentCommerceService(signedTransactions, signedNotifications = new Map()) {
  const verifier = {
    verifyTransaction: async (signedTransaction) => {
      const transaction = signedTransactions.get(signedTransaction);
      if (!transaction) throw new Error('unknown_test_transaction');
      return transaction;
    },
    verifyNotification: async (signedPayload) => {
      const notification = signedNotifications.get(signedPayload);
      if (!notification) throw new Error('unknown_test_notification');
      return notification;
    },
  };
  return new CommerceService({
    appleIapBundleId: 'com.readyoufife.ios',
  }, { db: serviceDatabase }, verifier);
}

test('persists first purchase, exact replay, sequential membership and point batches atomically', async () => {
  const accountId = '81000000-0000-4000-8000-000000000001';
  const firstPurchaseAt = new Date(Date.now() - 2_000);
  const secondPurchaseAt = new Date(Date.now() - 1_000);
  const signedTransactions = new Map([
    ['first-jws', verifiedCommerceTransaction({ accountId, transactionId: 'persistent-first', purchaseDate: firstPurchaseAt })],
    ['second-jws', verifiedCommerceTransaction({
      accountId,
      transactionId: 'persistent-second',
      productId: 'com.readyoufife.ios.membership.15d.v1',
      purchaseDate: secondPurchaseAt,
    })],
  ]);
  const commerce = persistentCommerceService(signedTransactions);
  await serviceDatabase.insert(databaseSchema.accounts).values({ id: accountId });

  const first = await commerce.verifyAppleTransaction(accountId, 'first-jws');
  const replay = await commerce.verifyAppleTransaction(accountId, 'first-jws');
  const second = await commerce.verifyAppleTransaction(accountId, 'second-jws');
  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.equal(second.created, true);
  assert.equal(second.entitlement.membership.active, true);
  assert.equal(second.entitlement.aiPoints.available, 250);
  assert.ok(second.entitlement.aiPoints.nextGrantAt);

  const orders = await serviceDatabase.select().from(databaseSchema.commerceOrders)
    .where(and(
      eq(databaseSchema.commerceOrders.environment, 'production'),
      eq(databaseSchema.commerceOrders.accountId, accountId),
    ));
  const transactions = await serviceDatabase.select().from(databaseSchema.appleTransactions)
    .where(and(
      eq(databaseSchema.appleTransactions.environment, 'production'),
      eq(databaseSchema.appleTransactions.accountId, accountId),
    ));
  const activeSegments = await serviceDatabase.select().from(databaseSchema.membershipEntitlementSegments)
    .where(and(
      eq(databaseSchema.membershipEntitlementSegments.environment, 'production'),
      eq(databaseSchema.membershipEntitlementSegments.accountId, accountId),
      eq(databaseSchema.membershipEntitlementSegments.status, 'active'),
    ));
  assert.equal(orders.length, 2);
  assert.equal(transactions.length, 2);
  assert.equal(activeSegments.length, 2);
  const sortedSegments = activeSegments.sort((left, right) => left.startsAt - right.startsAt);
  assert.equal(sortedSegments[1].startsAt.getTime(), sortedSegments[0].endsAt.getTime());
  assert.equal(
    sortedSegments[1].endsAt.getTime() - sortedSegments[0].startsAt.getTime(),
    22 * 24 * 60 * 60 * 1_000,
  );
});

test('serializes concurrent replay without duplicate orders or benefits', async () => {
  const accountId = '81000000-0000-4000-8000-000000000002';
  const transaction = verifiedCommerceTransaction({
    accountId,
    transactionId: 'persistent-concurrent',
    productId: 'com.readyoufife.ios.membership.31d.v1',
  });
  const commerce = persistentCommerceService(new Map([['concurrent-jws', transaction]]));
  await serviceDatabase.insert(databaseSchema.accounts).values({ id: accountId });

  const results = await Promise.all(
    Array.from({ length: 8 }, () => commerce.verifyAppleTransaction(accountId, 'concurrent-jws')),
  );
  assert.equal(results.filter((result) => result.created).length, 1);
  const orders = await serviceDatabase.select().from(databaseSchema.commerceOrders)
    .where(and(
      eq(databaseSchema.commerceOrders.environment, 'production'),
      eq(databaseSchema.commerceOrders.accountId, accountId),
    ));
  const batches = await serviceDatabase.select().from(databaseSchema.aiPointBatches)
    .where(and(
      eq(databaseSchema.aiPointBatches.environment, 'production'),
      eq(databaseSchema.aiPointBatches.accountId, accountId),
      eq(databaseSchema.aiPointBatches.sourceType, 'membership'),
    ));
  assert.equal(orders.length, 1);
  assert.equal(batches.length, 1);
  assert.equal(results.at(-1).entitlement.aiPoints.available, 1_000);
});

test('isolates identical transaction ids and entitlement queries across Apple environments', async () => {
  const accountId = '81000000-0000-4000-8000-000000000003';
  const transactionId = 'same-id-both-environments';
  const productionTransaction = verifiedCommerceTransaction({ accountId, transactionId });
  const sandboxTransaction = verifiedCommerceTransaction({
    accountId,
    environment: 'sandbox',
    transactionId,
    productId: 'com.readyoufife.ios.membership.15d.v1',
  });
  const commerce = persistentCommerceService(new Map([
    ['production-jws', productionTransaction],
    ['sandbox-jws', sandboxTransaction],
  ]));
  await serviceDatabase.insert(databaseSchema.accounts).values({ id: accountId });

  await commerce.verifyAppleTransaction(accountId, 'production-jws');
  await commerce.verifyAppleTransaction(accountId, 'sandbox-jws');
  const entitlements = await commerce.currentEntitlement(accountId);
  const productionEntitlement = entitlements.production;
  const sandboxEntitlement = entitlements.sandbox;
  assert.equal(productionEntitlement.environment, 'production');
  assert.equal(sandboxEntitlement.environment, 'sandbox');
  assert.equal(productionEntitlement.aiPoints.available, 250);
  assert.equal(sandboxEntitlement.aiPoints.available, 500);
  assert.ok(
    new Date(sandboxEntitlement.membership.expiresAt).getTime()
      > new Date(productionEntitlement.membership.expiresAt).getTime(),
  );
  const transactions = await serviceDatabase.select().from(databaseSchema.appleTransactions)
    .where(eq(databaseSchema.appleTransactions.transactionId, transactionId));
  assert.deepEqual(
    transactions.map((transaction) => transaction.environment).sort(),
    ['production', 'sandbox'],
  );
});

test('persists long membership point batches with only due points spendable', async () => {
  const accountId = '81000000-0000-4000-8000-000000000004';
  const transaction = verifiedCommerceTransaction({
    accountId,
    transactionId: 'persistent-62-days',
    productId: 'com.readyoufife.ios.membership.62d.v1',
  });
  const commerce = persistentCommerceService(new Map([['62-days-jws', transaction]]));
  await serviceDatabase.insert(databaseSchema.accounts).values({ id: accountId });
  const result = await commerce.verifyAppleTransaction(accountId, '62-days-jws');
  const batches = await serviceDatabase.select().from(databaseSchema.aiPointBatches)
    .where(and(
      eq(databaseSchema.aiPointBatches.environment, 'production'),
      eq(databaseSchema.aiPointBatches.accountId, accountId),
      eq(databaseSchema.aiPointBatches.sourceType, 'membership'),
    ));
  assert.equal(result.entitlement.aiPoints.available, 1_000);
  assert.ok(result.entitlement.aiPoints.nextGrantAt);
  assert.deepEqual(
    batches.sort((left, right) => left.ordinal - right.ordinal)
      .map((batch) => [batch.ordinal, batch.grantedPoints, batch.status]),
    [[0, 1_000, 'available'], [1, 1_000, 'scheduled']],
  );
});

test('late purchase discovery rebuilds from Apple purchase time without refilling elapsed membership', async () => {
  const accountId = '81000000-0000-4000-8000-000000000005';
  const currentPurchaseAt = new Date(Date.now() - 2_000);
  const expiredPurchaseAt = new Date(currentPurchaseAt.getTime() - (20 * 24 * 60 * 60 * 1_000));
  const current = verifiedCommerceTransaction({
    accountId,
    transactionId: 'late-discovery-current',
    productId: 'com.readyoufife.ios.membership.15d.v1',
    purchaseDate: currentPurchaseAt,
  });
  const historical = verifiedCommerceTransaction({
    accountId,
    transactionId: 'late-discovery-expired',
    purchaseDate: expiredPurchaseAt,
  });
  const commerce = persistentCommerceService(new Map([
    ['current-jws', current],
    ['historical-jws', historical],
  ]));
  await serviceDatabase.insert(databaseSchema.accounts).values({ id: accountId });
  const before = await commerce.verifyAppleTransaction(accountId, 'current-jws');
  const after = await commerce.verifyAppleTransaction(accountId, 'historical-jws');
  assert.equal(after.entitlement.membership.expiresAt, before.entitlement.membership.expiresAt);
  const historicalOrder = await serviceDatabase.select().from(databaseSchema.commerceOrders)
    .where(and(
      eq(databaseSchema.commerceOrders.environment, 'production'),
      eq(databaseSchema.commerceOrders.externalOrderId, 'late-discovery-expired'),
    ));
  assert.equal(historicalOrder[0].membershipEffectiveAt.getTime(), expiredPurchaseAt.getTime());
  assert.equal(after.entitlement.aiPoints.available, 750);
});

test('processes refund, duplicate, reversal and stale notifications without double-changing benefits', async () => {
  const accountId = '82000000-0000-4000-8000-000000000001';
  const purchaseDate = new Date(Date.now() - 10_000);
  const refundDate = new Date(Date.now() - 5_000);
  const reversalDate = new Date(Date.now() - 2_000);
  const purchase = verifiedCommerceTransaction({
    accountId,
    transactionId: 'notification-refund-cycle',
    productId: 'com.readyoufife.ios.membership.31d.v1',
    purchaseDate,
  });
  const refundTransaction = verifiedCommerceTransaction({
    accountId,
    transactionId: purchase.transactionId,
    productId: purchase.productId,
    purchaseDate,
    revocationDate: refundDate,
    signedDate: refundDate,
  });
  const reversalTransaction = verifiedCommerceTransaction({
    accountId,
    transactionId: purchase.transactionId,
    productId: purchase.productId,
    purchaseDate,
    signedDate: reversalDate,
  });
  const staleRefundTransaction = verifiedCommerceTransaction({
    accountId,
    transactionId: purchase.transactionId,
    productId: purchase.productId,
    purchaseDate,
    revocationDate: refundDate,
    signedDate: new Date(refundDate.getTime() + 1),
  });
  const notifications = new Map([
    ['refund-jws', verifiedCommerceNotification({
      notificationType: 'REFUND',
      notificationUuid: '82000000-0000-4000-8000-000000000011',
      signedDate: refundDate,
      transaction: refundTransaction,
    })],
    ['reversal-jws', verifiedCommerceNotification({
      notificationType: 'REFUND_REVERSED',
      notificationUuid: '82000000-0000-4000-8000-000000000012',
      signedDate: reversalDate,
      transaction: reversalTransaction,
    })],
    ['stale-refund-jws', verifiedCommerceNotification({
      notificationType: 'REFUND',
      notificationUuid: '82000000-0000-4000-8000-000000000013',
      signedDate: reversalDate,
      transaction: staleRefundTransaction,
    })],
  ]);
  const commerce = persistentCommerceService(new Map([['purchase-jws', purchase]]), notifications);
  await serviceDatabase.insert(databaseSchema.accounts).values({ id: accountId });
  const purchaseResult = await commerce.verifyAppleTransaction(accountId, 'purchase-jws');
  assert.equal(purchaseResult.entitlement.aiPoints.available, 1_000);

  const [batch] = await serviceDatabase.select().from(databaseSchema.aiPointBatches)
    .where(and(
      eq(databaseSchema.aiPointBatches.environment, 'production'),
      eq(databaseSchema.aiPointBatches.accountId, accountId),
      eq(databaseSchema.aiPointBatches.sourceOrderId, (
        await serviceDatabase.select({ id: databaseSchema.commerceOrders.id })
          .from(databaseSchema.commerceOrders)
          .where(eq(databaseSchema.commerceOrders.externalOrderId, purchase.transactionId))
      )[0].id),
    ));
  assert.ok(batch);
  const reservationId = '82000000-0000-4000-8000-000000000021';
  await serviceDatabase.transaction(async (transaction) => {
    await transaction.insert(databaseSchema.aiPointReservations).values({
      id: reservationId,
      environment: 'production',
      accountId,
      operationId: 'notification-refund-reservation',
      capability: 'transcription',
      ruleVersion: 'ai-points-v1',
      points: 100,
      status: 'reserved',
    });
    await transaction.insert(databaseSchema.aiPointReservationAllocations).values({
      environment: 'production',
      accountId,
      reservationId,
      batchId: batch.id,
      points: 100,
    });
    await transaction.update(databaseSchema.aiPointBatches).set({ reservedPoints: 100 })
      .where(eq(databaseSchema.aiPointBatches.id, batch.id));
    await transaction.insert(databaseSchema.aiPointLedgerEntries).values({
      environment: 'production',
      accountId,
      batchId: batch.id,
      reservationId,
      operationId: 'notification-refund-reservation',
      entryType: 'reserve',
      direction: 'debit',
      points: 100,
    });
  });

  const refund = await commerce.processAppleNotification('refund-jws');
  const duplicate = await commerce.processAppleNotification('refund-jws');
  assert.deepEqual(refund, {
    duplicate: false,
    processed: true,
    environment: 'production',
    notificationUuid: '82000000-0000-4000-8000-000000000011',
  });
  assert.equal(duplicate.duplicate, true);
  let entitlement = await commerce.currentEntitlement(accountId);
  assert.equal(entitlement.production.membership.active, false);
  assert.equal(entitlement.production.aiPoints.available, 0);
  const [releasedReservation] = await serviceDatabase.select()
    .from(databaseSchema.aiPointReservations)
    .where(eq(databaseSchema.aiPointReservations.id, reservationId));
  assert.equal(releasedReservation.status, 'released');

  await commerce.processAppleNotification('reversal-jws');
  entitlement = await commerce.currentEntitlement(accountId);
  assert.equal(entitlement.production.membership.active, true);
  assert.equal(entitlement.production.aiPoints.available, 1_000);

  await commerce.processAppleNotification('stale-refund-jws');
  entitlement = await commerce.currentEntitlement(accountId);
  assert.equal(entitlement.production.membership.active, true);
  assert.equal(entitlement.production.aiPoints.available, 1_000);
  const events = await serviceDatabase.select().from(databaseSchema.appleNotificationEvents)
    .where(eq(databaseSchema.appleNotificationEvents.environment, 'production'));
  assert.equal(events.filter((event) => event.notificationUuid.startsWith('82000000-')).length, 3);
});

test('keeps notification effects isolated between Sandbox and Production', async () => {
  const accountId = '82000000-0000-4000-8000-000000000002';
  const purchaseDate = new Date(Date.now() - 5_000);
  const production = verifiedCommerceTransaction({
    accountId,
    environment: 'production',
    transactionId: 'notification-environment-isolation',
    purchaseDate,
  });
  const sandbox = verifiedCommerceTransaction({
    accountId,
    environment: 'sandbox',
    transactionId: 'notification-environment-isolation',
    purchaseDate,
  });
  const refundDate = new Date(Date.now() - 1_000);
  const sandboxRefund = verifiedCommerceTransaction({
    accountId,
    environment: 'sandbox',
    transactionId: sandbox.transactionId,
    purchaseDate,
    revocationDate: refundDate,
    signedDate: refundDate,
  });
  const commerce = persistentCommerceService(new Map([
    ['production-env-jws', production],
    ['sandbox-env-jws', sandbox],
  ]), new Map([
    ['sandbox-refund-jws', verifiedCommerceNotification({
      environment: 'sandbox',
      notificationType: 'REFUND',
      notificationUuid: '82000000-0000-4000-8000-000000000031',
      signedDate: refundDate,
      transaction: sandboxRefund,
    })],
  ]));
  await serviceDatabase.insert(databaseSchema.accounts).values({ id: accountId });
  await commerce.verifyAppleTransaction(accountId, 'production-env-jws');
  await commerce.verifyAppleTransaction(accountId, 'sandbox-env-jws');
  await commerce.processAppleNotification('sandbox-refund-jws');
  const entitlement = await commerce.currentEntitlement(accountId);
  assert.equal(entitlement.production.membership.active, true);
  assert.equal(entitlement.production.aiPoints.available, 250);
  assert.equal(entitlement.sandbox.membership.active, false);
  assert.equal(entitlement.sandbox.aiPoints.available, 0);
});

test('persists an unknown owner notification for retry and reconciles it after client verification', async () => {
  const accountId = '82000000-0000-4000-8000-000000000003';
  const purchaseDate = new Date(Date.now() - 5_000);
  const ownedTransaction = verifiedCommerceTransaction({
    accountId,
    transactionId: 'notification-delayed-owner',
    purchaseDate,
  });
  const unknownOwnerTransaction = { ...ownedTransaction, appAccountToken: undefined };
  const notificationUuid = '82000000-0000-4000-8000-000000000041';
  const commerce = persistentCommerceService(
    new Map([['delayed-owner-purchase-jws', ownedTransaction]]),
    new Map([['delayed-owner-refund-jws', verifiedCommerceNotification({
      notificationType: 'REFUND',
      notificationUuid,
      transaction: unknownOwnerTransaction,
    })]]),
  );
  await serviceDatabase.insert(databaseSchema.accounts).values({ id: accountId });
  await assert.rejects(
    commerce.processAppleNotification('delayed-owner-refund-jws'),
    (error) => error?.getStatus?.() === 503,
  );
  const [failedEvent] = await serviceDatabase.select().from(databaseSchema.appleNotificationEvents)
    .where(eq(databaseSchema.appleNotificationEvents.notificationUuid, notificationUuid));
  assert.equal(failedEvent.status, 'failed');
  assert.equal(failedEvent.errorCode, 'apple_notification_transaction_unresolved');

  await commerce.verifyAppleTransaction(accountId, 'delayed-owner-purchase-jws');
  const reconciled = await commerce.processAppleNotification('delayed-owner-refund-jws');
  assert.equal(reconciled.processed, true);
  const entitlement = await commerce.currentEntitlement(accountId);
  assert.equal(entitlement.production.membership.active, false);
  assert.equal(entitlement.production.aiPoints.available, 0);
  const [processedEvent] = await serviceDatabase.select().from(databaseSchema.appleNotificationEvents)
    .where(eq(databaseSchema.appleNotificationEvents.notificationUuid, notificationUuid));
  assert.equal(processedEvent.status, 'processed');
  assert.equal(processedEvent.errorCode, null);
});

test('rejects a changed payload for an already processed notification UUID', async () => {
  const notificationUuid = '82000000-0000-4000-8000-000000000051';
  const first = verifiedCommerceNotification({
    notificationType: 'DID_CHANGE_RENEWAL_STATUS',
    notificationUuid,
  });
  const changed = {
    ...first,
    notificationType: 'EXPIRED',
    signedPayloadHash: 'f'.repeat(64),
  };
  const commerce = persistentCommerceService(new Map(), new Map([
    ['first-event-jws', first],
    ['changed-event-jws', changed],
  ]));
  await commerce.processAppleNotification('first-event-jws');
  await assert.rejects(
    commerce.processAppleNotification('changed-event-jws'),
    (error) => error?.getStatus?.() === 409,
  );
  const events = await serviceDatabase.select().from(databaseSchema.appleNotificationEvents)
    .where(eq(databaseSchema.appleNotificationEvents.notificationUuid, notificationUuid));
  assert.equal(events.length, 1);
  assert.equal(events[0].notificationType, 'DID_CHANGE_RENEWAL_STATUS');
});

test('reports naturally expired non-renewing membership as inactive without deleting history', async () => {
  const accountId = '82000000-0000-4000-8000-000000000004';
  const purchaseDate = new Date(Date.now() - (8 * 24 * 60 * 60 * 1_000));
  const purchase = verifiedCommerceTransaction({
    accountId,
    transactionId: 'notification-expired-membership',
    purchaseDate,
  });
  const commerce = persistentCommerceService(new Map([['expired-purchase-jws', purchase]]));
  await serviceDatabase.insert(databaseSchema.accounts).values({ id: accountId });
  await commerce.verifyAppleTransaction(accountId, 'expired-purchase-jws');
  const entitlement = await commerce.currentEntitlement(accountId);
  assert.equal(entitlement.production.membership.active, false);
  assert.ok(entitlement.production.membership.expiresAt);
  const segments = await serviceDatabase.select().from(databaseSchema.membershipEntitlementSegments)
    .where(and(
      eq(databaseSchema.membershipEntitlementSegments.environment, 'production'),
      eq(databaseSchema.membershipEntitlementSegments.accountId, accountId),
    ));
  assert.equal(segments.length, 1);
});
