import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test, { after, before } from 'node:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { exportJWK, SignJWT } from 'jose';

import { RecentAuthService } from '../src/auth/recent-auth.service.ts';
import { AppleAuthHttpError } from '../src/auth/apple-auth-http.ts';
import { AppleAuthService } from '../src/auth/apple-auth.service.ts';
import { IdentityDigestService } from '../src/account/identity-digest.service.ts';
import { AccountIdentityService } from '../src/account/account-identity.service.ts';
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
    accountIdentityHashKeyVersion: 2,
    accountIdentityHashPreviousKeys: [{ secret: 'previous-identity-digest-secret-32-bytes', version: 1 }],
    accountIdentityHashSecret: 'current-identity-digest-secret-32-bytes',
    appleCredentialEncryptionKey: Buffer.alloc(32, 7).toString('base64'),
    appleKeyId: 'TESTKEY001',
    applePrivateKey,
    appleSignInClientId: 'com.feizhuicao.app',
    appleTeamId: 'TESTTEAM01',
    ...overrides,
  };
}

function appleSession({
  accountId = '50000000-0000-4000-8000-000000000001',
  authUserId = '50000000-0000-4000-8000-000000000002',
  sessionId = '50000000-0000-4000-8000-000000000003',
  subject = 'apple-subject-1',
} = {}) {
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

function appleService(http, config = appleConfig()) {
  return new AppleAuthService(
    config,
    http,
    {
      verify: async (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')),
    },
    { db: serviceDatabase },
    new IdentityDigestService(config),
  );
}

test('the cumulative migration enables RLS on all 40 public tables', () => {
  assert.equal(
    queryScalar(`
      SELECT COUNT(*)::text || ':' || COUNT(*) FILTER (WHERE relrowsecurity)::text
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
    `),
    '40:40',
  );
});

test('account-security authority tables are private to the API database role', () => {
  const protectedTables = [
    'account_content_credential_revocations',
    'account_deletion_auth_users',
    'account_deletion_jobs',
    'account_deletion_tombstones',
    'account_security_events',
    'apple_revocable_credentials',
    'lifetime_identity_benefit_claims',
    'recent_auth_challenges',
    'recent_auth_grants',
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
    accountIdentityHashKeyVersion: 1,
    accountIdentityHashSecret: 'previous-identity-digest-secret-32-bytes',
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
  }

  const successSource = appleSession({
    accountId: '50000000-0000-4000-8000-000000000030',
    authUserId: '51000000-0000-4000-8000-000000000030',
    sessionId: '52000000-0000-4000-8000-000000000030',
    subject: 'apple-revoke-success-subject',
  });
  const rawNonce = 'apple-revoke-success-nonce-000000';
  const successHttp = {
    exchangeAuthorizationCode: async () => ({
      accessToken: 'temporary-access-token',
      idToken: appleIdToken({ nonce: rawNonce, subject: successSource.identities[0].subject }),
      refreshToken: 'successful-refresh-token',
    }),
    revoke: async () => undefined,
  };
  const successService = appleService(successHttp);
  await successService.registerCredential(successSource, { authorizationCode: 'register-success-code', rawNonce });
  assert.deepEqual(await successService.revokeForAccount(successSource.user.id), { outcome: 'revoked' });
  assert.equal(
    queryScalar(`SELECT status || ':' || (last_error_code IS NULL)::text FROM apple_revocable_credentials WHERE account_id = '${successSource.user.id}'`),
    'revoked:true',
  );
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
