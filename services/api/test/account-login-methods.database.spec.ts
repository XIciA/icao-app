import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';
import * as schema from '../src/database/schema';
import { AccountIdentityService } from '../src/account/account-identity.service';
import { AccountLoginMethodsService } from '../src/account/account-login-methods.service';
import { AccountService } from '../src/account/account.service';
import { RecentAuthService } from '../src/auth/recent-auth.service';
import { SessionSecurityService } from '../src/auth/session-security.service';
import { WechatAuthService } from '../src/auth/wechat-auth.service';
import type { VerifiedAuthSession } from '../src/auth/auth.types';
import type { LoginMethodActionPurpose } from '@icao/contracts/native-auth';
const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: supabase.createClient }));
const config = {
  accountIdentityHashSecret: 'test-identity-hash-secret-long-enough-32-characters',
  supabaseUrl: 'http://127.0.0.1:8000', supabasePublishableKey: 'test-publishable-key', supabaseSecretKey: 'test-secret-key',
  wechatAppId: 'wx1234567890abcdef', wechatAppSecret: 'test-wechat-secret-not-real', wechatUniversalLink: 'https://test.invalid/wechat-auth/',
} as ApiConfig;
// An isolated local cluster tests the real services, joins, constraints and ledger writes.
// No environment files, existing clusters, customer accounts or network services are used.
const root = mkdtempSync(join(tmpdir(), 'icao-login-method-test-'));
const data = join(root, 'data');
let started = false;
let client: ReturnType<typeof postgres>;
let database: ReturnType<typeof drizzle<typeof schema>>;
beforeAll(async () => {
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('test_port_unavailable'));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
  execFileSync('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale'], { stdio: 'ignore' });
  execFileSync('pg_ctl', ['-D', data, '-o', `-F -h 127.0.0.1 -k ${root} -p ${port}`, '-w', 'start'], { stdio: 'ignore' });
  started = true;
  client = postgres({ host: '127.0.0.1', port, username: 'postgres', database: 'postgres', max: 3, onnotice: () => undefined });
  await client.unsafe(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_admin;
    GRANT USAGE, CREATE ON SCHEMA public TO supabase_admin;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,
      public boolean NOT NULL,file_size_limit bigint,allowed_mime_types text[]);
  `);
  const directory = join(process.cwd(), 'drizzle');
  for (const file of readdirSync(directory).filter((name) => /^00\d\d_.*\.sql$/u.test(name)).sort()) {
    await client.unsafe(readFileSync(join(directory, file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  }
  database = drizzle(client, { schema });
}, 30_000);

afterAll(async () => {
  if (client) await client.end();
  if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
  rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const dbService = { db: database } as unknown as DatabaseService;
  const grantTrial = vi.fn().mockResolvedValue({ created: false });
  const identities = new AccountIdentityService(config, dbService, undefined, { grantFreeTrial: grantTrial } as never);
  const recentAuth = new RecentAuthService(config, dbService, { verify: vi.fn().mockResolvedValue(undefined) });
  const sessions = new SessionSecurityService(dbService);
  const verifier = { verify: vi.fn<(token: string) => Promise<VerifiedAuthSession>>() };
  const authAdmin = { deleteUser: vi.fn(async (authUserId: string) => { await client`delete from auth.users where id = ${authUserId}::uuid`; }) };
  const authUsers = new Map<string, Record<string, unknown>>();
  const admin = {
    signOut: vi.fn().mockResolvedValue({ error: null }),
    getUserById: vi.fn(async (id: string) => ({ data: { user: authUsers.get(id) }, error: authUsers.has(id) ? null : { status: 404 } })),
    createUser: vi.fn(async (user: Record<string, unknown>) => { authUsers.set(user.id as string, user); await client`insert into auth.users(id) values(${user.id as string}::uuid) on conflict do nothing`; return { data: { user }, error: null }; }),
  };
  supabase.createClient.mockReturnValue({ auth: { admin } });
  const http = { exchangeCode: vi.fn().mockResolvedValue({ access_token: 'temporary-provider-token', openid: 'test-open-id', unionid: randomUUID() }) };
  const wechat = new WechatAuthService(config, http, dbService, identities, recentAuth);
  const service = new AccountLoginMethodsService(dbService, identities, recentAuth, sessions, wechat, { verify: async (token) => { const proof = await verifier.verify(token); await client`insert into auth.users(id) values(${proof.authUserId}::uuid) on conflict do nothing`; return proof; } }, authAdmin);
  return { identities, recentAuth, sessions, verifier, authAdmin, http, wechat, service, grantTrial, dbService };
}
function phoneBinding(f: ReturnType<typeof fixture>) {
  const phoneAuth = {
    startBinding: vi.fn().mockResolvedValue({ sent: true }),
    verifyBindingChallenge: vi.fn<(source: VerifiedAuthSession) => Promise<{ accessToken: string; refreshToken: string }>>(),
  };
  const account = new AccountService(config, f.verifier, f.dbService, f.identities, phoneAuth as never, f.recentAuth, f.sessions, {} as never, f.service);
  return { account, phoneAuth };
}
async function phoneTarget(f: ReturnType<typeof fixture>) {
  const authUserId = randomUUID();
  const phone = `+86139${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  await client`insert into auth.users(id) values(${authUserId}::uuid)`;
  const proof: VerifiedAuthSession = { accessToken: randomUUID(), authUserId, sessionId: randomUUID(), issuedAt: Math.floor(Date.now() / 1000),
    authenticationMethods: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) }],
    passwordSet: false, identities: [{ provider: 'phone', subject: phone }], user: { id: authUserId, phone, providers: ['phone'] } };
  await client`insert into auth.sessions(id,user_id) values(${proof.sessionId}::uuid,${authUserId}::uuid)`;
  f.verifier.verify.mockResolvedValue(proof);
  return { phone, proof };
}
async function owner(f: ReturnType<typeof fixture>, provider: 'phone' | 'apple' | 'wechat' = 'phone', accountId: string = randomUUID(), authUserId: string = randomUUID()) {
  const subject = provider === 'phone' ? `+86138${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}` : randomUUID();
  await client`insert into auth.users(id) values(${authUserId}::uuid) on conflict do nothing`;
  await database.insert(schema.accounts).values({ id: accountId }).onConflictDoNothing();
  await database.insert(schema.profiles).values({ userId: accountId }).onConflictDoNothing();
  await database.insert(schema.accountIdentities).values({ accountId, authUserId, provider, subjectHash: f.identities.hashIdentity(provider, subject) });
  const source: VerifiedAuthSession = {
    accessToken: randomUUID(), authUserId, sessionId: randomUUID(), issuedAt: Math.floor(Date.now() / 1000),
    authenticationMethods: [{ method: provider === 'phone' ? 'otp' : 'oauth', provider, timestamp: Math.floor(Date.now() / 1000) }],
    identities: [{ provider, subject }], user: { id: accountId, providers: [provider], ...(provider === 'phone' ? { phone: subject } : {}) },
  };
  await client`insert into auth.sessions(id,user_id) values(${source.sessionId}::uuid,${source.authUserId}::uuid)`;
  return source;
}
function appleProof(): VerifiedAuthSession {
  const authUserId = randomUUID();
  return { accessToken: randomUUID(), authUserId, sessionId: randomUUID(), issuedAt: Math.floor(Date.now() / 1000),
    authenticationMethods: [{ method: 'oauth', provider: 'apple', timestamp: Math.floor(Date.now() / 1000) }],
    identities: [{ provider: 'apple', subject: randomUUID() }], user: { id: authUserId, providers: ['apple'] } };
}
async function grant(f: ReturnType<typeof fixture>, source: VerifiedAuthSession, purpose: LoginMethodActionPurpose) {
  return (await f.recentAuth.issueVerifiedGrant(source, 'phone_otp', purpose)).grantId;
}
async function addApple(f: ReturnType<typeof fixture>, source: VerifiedAuthSession) {
  const proof = appleProof(); f.verifier.verify.mockResolvedValue(proof);
  await f.service.bindApple(source, { providerAccessToken: proof.accessToken, recentAuthGrantId: await grant(f, source, 'apple_binding') });
  return proof;
}
describe('account login methods with real identity and recent-auth transactions', () => {
  it('replaces a phone only after source verification and preserves the business account, social identities and learning', async () => {
    const f = fixture(); const initialId = randomUUID(); const source = await owner(f, 'phone', initialId, initialId);
    const apple = await addApple(f, source);
    await database.insert(schema.userDocuments).values({ userId: source.user.id, documentKey: 'learning-test', payload: { answers: [1, 2] } });
    await database.insert(schema.aiAllowanceAccounts).values({ environment: 'sandbox', accountId: source.user.id, anchorAt: new Date('2026-09-01T00:00:00Z') });
    const startsAt = new Date('2026-09-01T00:00:00Z'); const endsAt = new Date('2026-10-02T00:00:00Z');
    const [order] = await database.insert(schema.commerceOrders).values({
      environment: 'sandbox', channel: 'apple_app_store', externalOrderId: randomUUID(), accountId: source.user.id,
      originalAccountId: source.user.id, productKey: 'membership_31d_v1', externalProductId: 'com.readyoufife.ios.membership.31d.v1',
      durationDays: 31, aiPointRuleVersion: 'ai-weekly-v1', membershipGrantSource: 'purchase_discovery',
      membershipEffectiveAt: startsAt, membershipContributionMs: endsAt.getTime() - startsAt.getTime(), purchasedAt: startsAt,
    }).returning();
    await database.insert(schema.membershipEntitlementSegments).values({ environment: 'sandbox', accountId: source.user.id, orderId: order!.id, revision: 1, startsAt, endsAt });
    const { account, phoneAuth } = phoneBinding(f); const target = await phoneTarget(f);
    phoneAuth.verifyBindingChallenge.mockResolvedValue({ accessToken: target.proof.accessToken, refreshToken: 'new-phone-refresh' });
    const grantId = await grant(f, source, 'phone_binding');
    await account.startPhoneBinding(source, target.phone, '127.0.0.1', grantId);
    const result = await account.bindPhoneWithOtp(source, randomUUID(), target.phone, '123456', '127.0.0.1', grantId);
    expect(result.account).toMatchObject({ accountId: source.user.id, phone: target.phone, hasPassword: false, providers: ['phone', 'apple'] });
    expect(result.session.accessToken).toBe(target.proof.accessToken);
    expect((await f.identities.resolve(target.proof)).id).toBe(source.user.id);
    expect((await f.identities.resolve(apple)).id).toBe(source.user.id);
    await expect(f.identities.resolve(source)).rejects.toThrow('login_method_unlinked');
    expect(await client`select id from auth.users where id=${source.authUserId}::uuid`).toHaveLength(0);
    expect(await database.select().from(schema.accounts).where(eq(schema.accounts.id, source.user.id))).toMatchObject([{ status: 'active' }]);
    expect(await database.select().from(schema.userDocuments).where(eq(schema.userDocuments.userId, source.user.id))).toMatchObject([{ payload: { answers: [1, 2] } }]);
    expect(await database.select().from(schema.aiAllowanceAccounts).where(eq(schema.aiAllowanceAccounts.accountId, source.user.id))).toHaveLength(1);
    expect(await database.select().from(schema.membershipEntitlementSegments).where(eq(schema.membershipEntitlementSegments.accountId, source.user.id))).toMatchObject([{ status: 'active', orderId: order!.id, startsAt, endsAt }]);
  });

  it('does not send or consume a target phone code without proof of an already-owned identity', async () => {
    const f = fixture(); const source = await owner(f); const { account, phoneAuth } = phoneBinding(f); const target = await phoneTarget(f);
    await expect(account.startPhoneBinding(source, target.phone)).rejects.toThrow('phone_reauthentication_required');
    await expect(account.bindPhoneWithOtp(source, randomUUID(), target.phone, '123456')).rejects.toThrow('phone_reauthentication_required');
    expect(phoneAuth.startBinding).not.toHaveBeenCalled(); expect(phoneAuth.verifyBindingChallenge).not.toHaveBeenCalled();
    expect(f.authAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it('keeps the old phone when the target is occupied or OTP verification fails', async () => {
    const f = fixture(); const source = await owner(f); const occupied = await owner(f); const { account, phoneAuth } = phoneBinding(f);
    phoneAuth.verifyBindingChallenge.mockRejectedValueOnce(new Error('invalid_phone_otp'));
    await expect(account.bindPhoneWithOtp(source, randomUUID(), occupied.user.phone!, '000000', '127.0.0.1', await grant(f, source, 'phone_binding'))).rejects.toThrow('invalid_phone_otp');
    phoneAuth.verifyBindingChallenge.mockResolvedValue({ accessToken: occupied.accessToken, refreshToken: 'occupied-refresh' });
    f.verifier.verify.mockResolvedValue(occupied);
    await expect(account.bindPhoneWithOtp(source, randomUUID(), occupied.user.phone!, '123456', '127.0.0.1', await grant(f, source, 'phone_binding'))).rejects.toThrow('phone_already_registered');
    expect((await f.identities.resolve(source)).id).toBe(source.user.id);
    expect((await f.identities.resolve(occupied)).id).toBe(occupied.user.id);
    expect(f.authAdmin.deleteUser).not.toHaveBeenCalled();
    expect(await database.select().from(schema.accountLoginMethodRemovals).where(eq(schema.accountLoginMethodRemovals.accountId, source.user.id))).toHaveLength(0);
  });

  it('fences the old phone while provider deletion retries, without undoing a successful replacement', async () => {
    const f = fixture(); const source = await owner(f); const { account, phoneAuth } = phoneBinding(f); const target = await phoneTarget(f);
    phoneAuth.verifyBindingChallenge.mockResolvedValue({ accessToken: target.proof.accessToken, refreshToken: 'new-phone-refresh' });
    f.authAdmin.deleteUser.mockRejectedValueOnce(new Error('provider_offline'));
    await expect(account.bindPhoneWithOtp(source, randomUUID(), target.phone, '123456', '127.0.0.1', await grant(f, source, 'phone_binding'))).resolves.toMatchObject({ account: { accountId: source.user.id } });
    await expect(f.identities.resolve(source)).rejects.toThrow('login_method_unlinked');
    expect((await f.identities.resolve(target.proof)).id).toBe(source.user.id);
    await f.service.retryRemovals();
    expect(await database.select().from(schema.accountLoginMethodRemovals).where(eq(schema.accountLoginMethodRemovals.authUserId, source.authUserId))).toMatchObject([{ status: 'completed' }]);
  });

  it('binds an unused Apple principal into one business account without another trial or session switch', async () => {
    const f = fixture(); const source = await owner(f); const proof = appleProof(); f.verifier.verify.mockResolvedValue(proof);
    const grantId = await grant(f, source, 'apple_binding');
    expect(await f.service.bindApple(source, { providerAccessToken: proof.accessToken, recentAuthGrantId: grantId })).toMatchObject({ accountId: source.user.id, sessionEnded: false, providers: expect.arrayContaining(['phone', 'apple']) });
    expect(await database.select().from(schema.accounts).where(eq(schema.accounts.id, proof.authUserId))).toHaveLength(0);
    const [used] = await database.select().from(schema.recentAuthGrants).where(eq(schema.recentAuthGrants.id, grantId));
    expect(used?.consumedAt).toBeInstanceOf(Date);
    expect((await f.identities.resolve(proof)).id).toBe(source.user.id);
    expect(f.grantTrial).not.toHaveBeenCalled();
  });
  it('consumes an occupied-identity grant and never moves either account', async () => {
    const f = fixture(); const source = await owner(f); const occupied = await owner(f, 'apple'); f.verifier.verify.mockResolvedValue(occupied);
    const grantId = await grant(f, source, 'apple_binding');
    await expect(f.service.bindApple(source, { providerAccessToken: occupied.accessToken, recentAuthGrantId: grantId })).rejects.toThrow('login_method_already_owned');
    const [used] = await database.select().from(schema.recentAuthGrants).where(eq(schema.recentAuthGrants.id, grantId));
    expect(used?.consumedAt).toBeInstanceOf(Date);
    expect(await f.identities.providersForAccount(source.user.id)).toEqual(['phone']);
    expect((await f.identities.resolve(occupied)).id).toBe(occupied.user.id);
  });
  it('allows only one concurrent account to claim the same unused principal', async () => {
    const f = fixture(); const a = await owner(f); const b = await owner(f); const proof = appleProof(); f.verifier.verify.mockResolvedValue(proof);
    const [ga, gb] = await Promise.all([grant(f, a, 'apple_binding'), grant(f, b, 'apple_binding')]);
    const outcomes = await Promise.allSettled([
      f.service.bindApple(a, { providerAccessToken: proof.accessToken, recentAuthGrantId: ga }),
      f.service.bindApple(b, { providerAccessToken: proof.accessToken, recentAuthGrantId: gb }),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rows = await database.select().from(schema.accountIdentities).where(eq(schema.accountIdentities.authUserId, proof.authUserId));
    expect(rows).toHaveLength(1); expect([a.user.id, b.user.id]).toContain(rows[0]!.accountId);
  });
  it('rejects the wrong-purpose grant, stale OAuth and TOTP-only Apple proofs', async () => {
    const f = fixture(); const source = await owner(f); const proof = appleProof(); f.verifier.verify.mockResolvedValue(proof);
    await expect(f.service.bindApple(source, { providerAccessToken: proof.accessToken, recentAuthGrantId: await grant(f, source, 'wechat_binding') })).rejects.toThrow('recent_auth_required');
    proof.authenticationMethods[0]!.timestamp -= 601;
    await expect(f.service.verifyAppleProof(proof.accessToken)).rejects.toThrow('apple_reauthentication_required');
    proof.authenticationMethods = [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }];
    await expect(f.service.verifyAppleProof(proof.accessToken)).rejects.toThrow('apple_reauthentication_required');
    expect(await f.identities.providersForAccount(source.user.id)).toEqual(['phone']);
  });
  it('separates WeChat target binding from login and existing-method proof; consumes the code once', async () => {
    const f = fixture(); const source = await owner(f);
    const challenge = await f.service.startWechatBinding(source, '127.0.0.2');
    const input = { challengeId: challenge.challengeId, state: challenge.state, code: randomUUID(), recentAuthGrantId: await grant(f, source, 'wechat_binding') };
    await expect(f.wechat.completeRecentAuth(source, { ...input, purpose: 'wechat_binding' }, '127.0.0.2')).rejects.toThrow('invalid_wechat_auth_response');
    expect(await f.service.bindWechat(source, input, '127.0.0.2')).toMatchObject({ accountId: source.user.id, providers: expect.arrayContaining(['wechat', 'phone']), sessionEnded: false });
    expect(f.http.exchangeCode).toHaveBeenCalledTimes(1);
    await expect(f.service.bindWechat(source, input, '127.0.0.2')).rejects.toThrow('invalid_wechat_auth_response');
    expect(f.http.exchangeCode).toHaveBeenCalledTimes(1);
    const reauth = await f.wechat.startRecentAuth(source, '127.0.0.2', 'apple_binding');
    const proofGrant = await f.wechat.completeRecentAuth(source, { challengeId: reauth.challengeId, state: reauth.state, code: randomUUID(), purpose: 'apple_binding' }, '127.0.0.2');
    expect(proofGrant.purpose).toBe('apple_binding');
    expect(proofGrant.expiresAt - Date.now()).toBeGreaterThan(590_000);
    await expect(f.recentAuth.consume(source, proofGrant.grantId, 'wechat_unbinding')).rejects.toThrow('recent_auth_required');
  });
  it('protects the last method, unlinks a separate principal, and blocks all old tokens', async () => {
    const f = fixture(); const primaryId = randomUUID(); const source = await owner(f, 'apple', primaryId, primaryId);
    await expect(f.service.unbind(source, 'apple', await grant(f, source, 'apple_unbinding'))).rejects.toThrow('last_login_method_required');
    await owner(f, 'phone', source.user.id);
    expect(await f.service.unbind(source, 'apple', await grant(f, source, 'apple_unbinding'))).toMatchObject({ providers: ['phone'], sessionEnded: true });
    expect(f.authAdmin.deleteUser).toHaveBeenCalledWith(source.authUserId);
    // Auth deletion can cascade old revocation rows. The durable identity fence remains authoritative.
    await expect(f.identities.resolve(source)).rejects.toThrow('login_method_unlinked');
    await expect(f.identities.resolve({ ...source, sessionId: randomUUID(), issuedAt: source.issuedAt + 3600 })).rejects.toThrow('login_method_unlinked');
    const [account] = await database.select().from(schema.accounts).where(eq(schema.accounts.id, source.user.id));
    expect(account?.status).toBe('active');
  });
  it('fences failed auth cleanup, retries, and rotates a later WeChat login to an independent principal', async () => {
    const f = fixture(); const source = await owner(f); const challenge = await f.service.startWechatBinding(source, '127.0.0.3');
    await f.service.bindWechat(source, { challengeId: challenge.challengeId, state: challenge.state, code: randomUUID(), recentAuthGrantId: await grant(f, source, 'wechat_binding') }, '127.0.0.3');
    const [identity] = await database.select().from(schema.accountIdentities).where(eq(schema.accountIdentities.accountId, source.user.id));
    expect(identity).toBeDefined();
    const rows = await database.select().from(schema.accountIdentities).where(eq(schema.accountIdentities.accountId, source.user.id));
    const target = rows.find(({ provider }) => provider === 'wechat')!;
    const [principal] = await database.select().from(schema.wechatAuthPrincipals).where(eq(schema.wechatAuthPrincipals.authUserId, target.authUserId));
    f.authAdmin.deleteUser.mockRejectedValueOnce(new Error('auth_provider_outage'));
    expect(await f.service.unbind(source, 'wechat', await grant(f, source, 'wechat_unbinding'))).toMatchObject({ sessionEnded: false, providers: ['phone'] });
    const ensure = (f.wechat as unknown as { ensureAuthUser(value: string): Promise<{ id: string }> }).ensureAuthUser.bind(f.wechat);
    await expect(ensure(principal!.subjectDigest)).rejects.toThrow('login_method_removal_pending');
    await f.service.retryRemovals();
    const replacement = await ensure(principal!.subjectDigest);
    expect(replacement.id).not.toBe(principal!.authUserId);
    const resolved = await f.identities.resolve({ ...appleProof(), authUserId: replacement.id,
      identities: [{ provider: 'wechat', subject: principal!.subjectDigest }], user: { id: replacement.id, providers: ['wechat'] } });
    expect(resolved.id).not.toBe(source.user.id);
    expect(await f.identities.providersForAccount(source.user.id)).toEqual(['phone']);
  });
  it('accepts the bound Apple method from a different current principal, rejecting another account', async () => {
    const f = fixture(); const source = await owner(f); const proof = await addApple(f, source);
    const verified = await f.service.verifiedBoundApple(source, proof.accessToken);
    expect(verified.user.id).toBe(source.user.id); expect(verified.authUserId).toBe(proof.authUserId);
    await expect(f.service.verifiedBoundApple(await owner(f), proof.accessToken)).rejects.toThrow('apple_reauthentication_required');
  });
  it('repairs a legacy Apple row UUID only for its verified owning principal, preserving the account', async () => {
    const f = fixture(); const source = await owner(f, 'apple');
    const legacySubject = source.identities[0]!.subject;
    const canonicalSubject = randomUUID();
    source.identities = [{ provider: 'apple', subject: canonicalSubject, legacySubject }];
    expect((await f.identities.resolve(source)).id).toBe(source.user.id);
    const [row] = await database.select().from(schema.accountIdentities).where(eq(schema.accountIdentities.authUserId, source.authUserId));
    expect(row?.subjectHash).toBe(f.identities.hashIdentity('apple', canonicalSubject));
    expect(row?.accountId).toBe(source.user.id);
  });

});
