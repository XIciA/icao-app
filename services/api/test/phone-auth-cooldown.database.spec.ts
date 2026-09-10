import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PhoneAuthService } from '../src/auth/phone-auth.service';
import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';
import * as schema from '../src/database/schema';

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: supabase.createClient }));
const config = {
  accountIdentityHashSecret: 'isolated-test-identity-secret-long-enough',
  supabaseUrl: 'http://127.0.0.1:8000', supabasePublishableKey: 'test-publishable-key',
} as ApiConfig;
// Real predicates and state transitions in a disposable cluster; no provider calls.
const root = mkdtempSync(join(tmpdir(), 'icao-phone-cooldown-test-'));
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

let sequence = 0;
async function fixture(status = 'ready', delivered = true, ageMs = 1_000) {
  const phone = `+8613800138${String(++sequence).padStart(3, '0')}`;
  const id = randomUUID();
  const createdAt = new Date(Date.now() - ageMs);
  const digest = (value: string) => createHmac('sha256', config.accountIdentityHashSecret).update(value).digest('hex');
  await database.insert(schema.phoneOtpIntents).values({
    id, phoneDigest: digest(`phone-otp-intent-v1\0${phone}`), purpose: 'login', status,
    createdAt, providerCompletedAt: createdAt, otpNotBefore: createdAt,
    expiresAt: new Date(createdAt.getTime() + 300_000),
    otpTokenDigest: delivered ? digest(`phone-otp-token-v1\0${id}\0${'123456'}`) : null,
  });
  const signInWithOtp = vi.fn().mockResolvedValue({ data: { session: null, user: null }, error: null });
  const verifyOtp = vi.fn().mockResolvedValue({ data: {
    session: { access_token: 'test-access', refresh_token: 'test-refresh', expires_at: 2_000_000_000 },
    user: { id: randomUUID(), phone },
  }, error: null });
  supabase.createClient.mockReturnValue({ auth: { signInWithOtp, verifyOtp } });
  const instance = new PhoneAuthService(config, { db: database } as unknown as DatabaseService);
  const current = async () => (await database.select().from(schema.phoneOtpIntents).where(eq(schema.phoneOtpIntents.id, id)))[0];
  return { id, phone, instance, signInWithOtp, verifyOtp, current };
}

describe('phone OTP purpose cooldown with real database predicates', () => {
  it('keeps six wrong guesses from unlocking a new SMS through password recovery', async () => {
    const f = await fixture();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await expect(f.instance.verifyLogin({ challengeId: f.id, phone: f.phone, purpose: 'login', token: '654321' }, '203.0.113.8')).rejects.toThrow('invalid_phone_otp');
    }
    expect(await f.current()).toMatchObject({ attemptCount: 6, status: 'failed' });
    const recovery = await f.instance.startRecovery(f.phone, '203.0.113.8');
    expect(recovery.accepted).toBe(true); // Recovery still conceals account/challenge state.
    expect(await database.select().from(schema.phoneOtpIntents).where(eq(schema.phoneOtpIntents.id, recovery.challengeId))).toHaveLength(0);
    expect(f.signInWithOtp).not.toHaveBeenCalled(); expect(f.verifyOtp).not.toHaveBeenCalled();
    await expect(f.instance.start(f.phone, '203.0.113.8')).rejects.toThrow('phone_otp_rate_limited');
  });

  it('allows a successfully consumed login to continue into recovery but not another login SMS', async () => {
    const f = await fixture();
    await f.instance.verifyLogin({ challengeId: f.id, phone: f.phone, purpose: 'login', token: '123456' }, '203.0.113.8');
    expect(await f.current()).toMatchObject({ status: 'consumed' });
    await expect(f.instance.start(f.phone, '203.0.113.8')).rejects.toThrow('phone_otp_rate_limited');
    const recovery = await f.instance.startRecovery(f.phone, '203.0.113.8');
    expect(f.signInWithOtp).toHaveBeenCalledOnce();
    expect(await database.select().from(schema.phoneOtpIntents).where(eq(schema.phoneOtpIntents.id, recovery.challengeId))).toHaveLength(1);
  });

  it('allows retry after a definite failure before delivery without a token digest', async () => {
    const f = await fixture('failed', false);
    await expect(f.instance.start(f.phone, '203.0.113.8')).resolves.toMatchObject({ accepted: true });
    expect(f.signInWithOtp).toHaveBeenCalledOnce();
  });

  it('allows a new challenge after the delivered failed challenge cooldown expires', async () => {
    const f = await fixture('failed', true, 61_000);
    await expect(f.instance.start(f.phone, '203.0.113.8')).resolves.toMatchObject({ accepted: true });
    expect(f.signInWithOtp).toHaveBeenCalledOnce();
  });
});
