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

import * as schema from '../src/database/schema';
import { AccountIdentityService } from '../src/account/account-identity.service';
import { AccountDeletionService } from '../src/account/account-deletion.service';
import { WechatAuthService } from '../src/auth/wechat-auth.service';
import { PersistentCommerceBenefitsService } from '../src/commerce/persistent-commerce-benefits.service';
import type { User } from '@supabase/supabase-js';
import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: supabase.createClient }));

// An isolated local cluster tests the real services, joins, constraints and ledger writes.
// No environment files, existing clusters, customer accounts or network services are used.
const root = mkdtempSync(join(tmpdir(), 'icao-wechat-auth-test-'));
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


const config = { accountIdentityHashSecret: 'isolated-test-identity-secret-at-least-32',
  supabaseUrl: 'http://127.0.0.1:8000', supabaseSecretKey: 'test', supabasePublishableKey: 'test' } as ApiConfig;

function fixture() {
  const users = new Map<string, User>();
  const createUser = vi.fn(async (input: { id: string; app_metadata: Record<string, string> }) => {
    if (users.has(input.id)) return { data: { user: null }, error: { status: 422 } };
    const user = { ...input } as User;
    await client`insert into auth.users(id) values (${input.id}) on conflict do nothing`;
    users.set(input.id, user);
    return { data: { user }, error: null };
  });
  const getUserById = vi.fn(async (id: string) => ({ data: { user: users.get(id) ?? null }, error: users.has(id) ? null : { status: 404 } }));
  supabase.createClient.mockReturnValue({ auth: { admin: { createUser, getUserById } } });
  const db = { db: database } as unknown as DatabaseService;
  const benefits = new PersistentCommerceBenefitsService();
  const identities = new AccountIdentityService(config, db, undefined, benefits);
  const service = new WechatAuthService(config, {} as never, db, identities, {} as never);
  const ensure = (subject: string) => (service as unknown as { ensureAuthUser(subject: string): Promise<User> }).ensureAuthUser(subject);
  const login = async (subject: string) => {
    const user = await ensure(subject);
    return identities.resolve({ authUserId: user.id, accessToken: 'test', authenticationMethods: [],
      identities: [{ provider: 'wechat', subject }], issuedAt: Math.floor(Date.now() / 1000) + 1,
      sessionId: randomUUID(), user: { id: user.id, providers: ['wechat'] } });
  };
  const removeObjects = vi.fn(async () => undefined);
  const deletion = new AccountDeletionService(config, { deleteUser: async (id: string) => { users.delete(id); await client`delete from auth.users where id = ${id}`; } } as never,
    {} as never, benefits, db, { removeObjects } as never, {} as never);
  const startDelete = async (accountId: string) => {
    await database.update(schema.accounts).set({ status: 'deleting' }).where(eq(schema.accounts.id, accountId));
    const [job] = await database.insert(schema.accountDeletionJobs).values({ accountId, idempotencyKey: randomUUID(), objectKeys: ['test-object'] }).returning();
    const identities = await database.select().from(schema.accountIdentities).where(eq(schema.accountIdentities.accountId, accountId));
    await database.insert(schema.accountDeletionAuthUsers).values(identities.map(({ authUserId }) => ({ jobId: job!.id, authUserId })));
    return job!.id;
  };
  return { ensure, login, createUser, users, startDelete, deletion, removeObjects };
}
const subject = () => randomUUID().replaceAll('-', '').repeat(2);

describe('WeChat re-registration with real PostgreSQL locks and deletion worker', () => {
  it('keeps normal logins stable and serializes concurrent registrations', async () => {
    const f = fixture(); const key = subject();
    const results = await Promise.all(Array.from({ length: 8 }, () => f.login(key)));
    expect(new Set(results.map(({ id }) => id)).size).toBe(1);
    expect((await f.login(key)).id).toBe(results[0]!.id);
    expect(await database.select().from(schema.wechatAuthPrincipals).where(eq(schema.wechatAuthPrincipals.subjectDigest, key))).toHaveLength(1);
  });

  it('creates fresh accounts after two deletions without restoring data, membership or lifetime trial', async () => {
    const f = fixture(); const key = subject();
    const first = await f.login(key);
    const claimsBefore = await database.select().from(schema.lifetimeIdentityBenefitClaims);
    expect(await database.select().from(schema.aiPointBatches).where(eq(schema.aiPointBatches.accountId, first.id))).not.toHaveLength(0);
    const ids = [first.id];
    for (let i = 0; i < 2; i += 1) {
      const old = ids.at(-1)!;
      const job = await f.startDelete(old);
      expect((await f.deletion.processJob(job)).status).toBe('completed');
      expect((await database.select().from(schema.accounts).where(eq(schema.accounts.id, old)))[0]!.status).toBe('deleted');
      expect(await database.select().from(schema.wechatAuthPrincipals).where(eq(schema.wechatAuthPrincipals.subjectDigest, key))).toHaveLength(0);
      const next = await f.login(key);
      expect(ids).not.toContain(next.id); ids.push(next.id);
      expect(await database.select().from(schema.aiPointBatches).where(eq(schema.aiPointBatches.accountId, next.id))).toHaveLength(0);
      expect(await database.select().from(schema.membershipEntitlementSegments).where(eq(schema.membershipEntitlementSegments.accountId, next.id))).toHaveLength(0);
      expect(await database.select().from(schema.learningRecords).where(eq(schema.learningRecords.userId, next.id))).toHaveLength(0);
    }
    expect(await database.select().from(schema.lifetimeIdentityBenefitClaims)).toHaveLength(claimsBefore.length);
  });

  it('repairs an existing mapping to a deleted legacy account, including a recreated Auth user', async () => {
    const f = fixture(); const key = subject(); const old = randomUUID();
    await database.insert(schema.accounts).values({ id: old, status: 'deleted' });
    await database.insert(schema.wechatAuthPrincipals).values({ authUserId: old, subjectDigest: key });
    f.users.set(old, { id: old, app_metadata: { icao_identity_provider: 'wechat', icao_wechat_subject: key }, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() } as User);
    const results = await Promise.all([f.login(key), f.login(key)]);
    expect(results[0]!.id).not.toBe(old); expect(results[1]!.id).toBe(results[0]!.id);
    expect((await database.select().from(schema.accounts).where(eq(schema.accounts.id, old)))[0]!.status).toBe('deleted');
  });

  it('persists a replacement if finalization removes the mapping while login waits for the account lock', async () => {
    const f = fixture(); const key = subject(); const old = await f.login(key);
    let pending!: Promise<User>;
    await client.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`account:${old.id}`}, 0))`;
      pending = f.ensure(key);
      await vi.waitFor(async () => {
        const [row] = await client`select count(*)::int as count from pg_locks where locktype = 'advisory' and not granted`;
        expect(row!.count).toBeGreaterThan(0);
      });
      await tx`delete from wechat_auth_principals where subject_digest = ${key}`;
      await tx`delete from account_identities where account_id = ${old.id}`;
      await tx`update accounts set status = 'deleted' where id = ${old.id}`;
    });
    const next = await pending;
    expect(next.id).not.toBe(old.id);
    expect((await f.ensure(key)).id).toBe(next.id);
    expect((await database.select().from(schema.wechatAuthPrincipals).where(eq(schema.wechatAuthPrincipals.subjectDigest, key)))[0]!.authUserId).toBe(next.id);
  });

  it('reuses its committed reservation after external Auth creation fails', async () => {
    const f = fixture(); const key = subject();
    f.createUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 503 } });
    await expect(f.login(key)).rejects.toThrow('wechat_session_unavailable');
    const [reserved] = await database.select().from(schema.wechatAuthPrincipals).where(eq(schema.wechatAuthPrincipals.subjectDigest, key));
    expect((await f.login(key)).id).toBe(reserved!.authUserId);
    expect(f.createUser.mock.calls.map(([input]) => input.id)).toEqual([reserved!.authUserId, reserved!.authUserId]);
  });

  it.each([false, true])('blocks incomplete deletion after Auth cleanup, linked account=%s', async (linked) => {
    const f = fixture(); const key = subject(); const old = await f.login(key);
    let accountId = old.id;
    if (linked) {
      accountId = randomUUID();
      await database.insert(schema.accounts).values({ id: accountId });
      await database.update(schema.accountIdentities).set({ accountId }).where(eq(schema.accountIdentities.authUserId, old.id));
    }
    const job = await f.startDelete(accountId);
    f.removeObjects.mockRejectedValueOnce(new Error('temporary storage failure'));
    expect((await f.deletion.processJob(job)).status).toBe('retryable');
    expect(f.users.has(old.id)).toBe(false);
    await expect(f.login(key)).rejects.toThrow('account_not_active');
    expect((await database.select().from(schema.wechatAuthPrincipals).where(eq(schema.wechatAuthPrincipals.subjectDigest, key)))[0]!.authUserId).toBe(old.id);
    expect((await f.deletion.processJob(job, new Date(Date.now() + 3600000))).status).toBe('completed');
    expect((await f.login(key)).id).not.toBe(old.id);
  });
});
