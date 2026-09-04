import { createHmac } from 'node:crypto';

import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WechatAuthService } from '../src/auth/wechat-auth.service';
import type { WechatAuthHttp } from '../src/auth/wechat-auth-http';
import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: supabase.createClient }));

const secret = 'wechat-auth-test-hash-secret-at-least-32-bytes';
const config = {
  accountIdentityHashSecret: secret,
  supabasePublishableKey: 'publishable-test-key',
  supabaseSecretKey: 'secret-test-key',
  supabaseUrl: 'http://127.0.0.1:8000',
  wechatAppId: 'wx1234567890abcdef',
  wechatAppSecret: 'wechat-secret-at-least-sixteen',
  wechatUniversalLink: 'https://api.example.com/wechat-auth/',
} as ApiConfig;

function digest(domain: 'code' | 'state' | 'subject', value: string) {
  return createHmac('sha256', secret)
    .update(`wechat-auth-v1\0${domain}\0${value}`)
    .digest('hex');
}

function query<T>(result: T) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & PromiseLike<T> = {
    then: ((onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected)) as Promise<T>['then'],
  } as never;
  for (const name of ['from', 'where', 'limit', 'for', 'set', 'returning']) {
    chain[name] = vi.fn(() => name === 'returning' ? Promise.resolve(result) : chain);
  }
  return chain;
}

function fixture(challenge: Record<string, unknown>, provider: WechatAuthHttp) {
  const transactionSelects = [[challenge], []];
  const transactionUpdates: Array<{ set: ReturnType<typeof vi.fn> }> = [];
  const transaction = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(() => query(transactionSelects.shift() ?? [])),
    update: vi.fn(() => {
      const q = query([{ id: challenge.id }]);
      transactionUpdates.push({ set: q.set! });
      return q;
    }),
  };
  const outsideUpdates: Array<{ set: ReturnType<typeof vi.fn> }> = [];
  const db = {
    transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction)),
    update: vi.fn(() => {
      const q = query([{ id: challenge.id }]);
      outsideUpdates.push({ set: q.set! });
      return q;
    }),
  };
  const service = new WechatAuthService(
    config,
    provider,
    { db } as unknown as DatabaseService,
    { hashIdentity: vi.fn() } as never,
    {} as never,
  );
  return { outsideUpdates, service, transactionUpdates };
}

describe('WechatAuthService challenge recovery', () => {
  beforeEach(() => {
    supabase.createClient.mockReset();
    supabase.createClient.mockReturnValue({ auth: { admin: {} } });
  });

  it('returns a deterministic pending capability without touching challenge storage when WeChat is unconfigured', async () => {
    const insert = vi.fn(() => { throw new Error('challenge storage must remain unused'); });
    const service = new WechatAuthService(
      { ...config, wechatAppId: '', wechatAppSecret: '', wechatUniversalLink: '' },
      {} as WechatAuthHttp,
      { db: { insert } } as unknown as DatabaseService,
      {} as never,
      {} as never,
    );

    const result = await service.start('203.0.113.9');
    expect(result).toMatchObject({
      challengeId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      status: 'configuration_pending',
    });
    expect(result).not.toHaveProperty('appId');
    expect(insert).not.toHaveBeenCalled();
  });

  it('persists a terminal failure when the provider exchange fails instead of leaving verifying state', async () => {
    const input = { challengeId: '10000000-0000-4000-8000-000000000001', code: 'single-use-code', state: 'opaque-state' };
    const provider = { exchangeCode: vi.fn().mockRejectedValue(new Error('timeout')) } as WechatAuthHttp;
    const { outsideUpdates, service, transactionUpdates } = fixture({
      accountId: null,
      attemptCount: 0,
      authUserId: null,
      codeDigest: null,
      id: input.challengeId,
      purpose: 'login',
      stateDigest: digest('state', input.state),
      status: 'pending',
      subjectDigest: null,
      verificationExpiresAt: null,
    }, provider);

    await expect((service as unknown as { verifyProviderSubject(value: typeof input, purpose: 'login'): Promise<unknown> })
      .verifyProviderSubject(input, 'login'))
      .rejects.toSatisfy((error: unknown) => error instanceof ServiceUnavailableException
        && error.message === 'wechat_provider_unavailable');

    expect(transactionUpdates[0]?.set).toHaveBeenCalledWith(expect.objectContaining({
      attemptCount: 1,
      codeDigest: digest('code', input.code),
      status: 'verifying',
      verificationExpiresAt: expect.any(Date),
    }));
    expect(outsideUpdates[0]?.set).toHaveBeenCalledWith({
      status: 'failed',
      verificationExpiresAt: null,
    });
  });

  it('retries a verified challenge without exchanging the one-time provider code twice', async () => {
    const input = { challengeId: '10000000-0000-4000-8000-000000000002', code: 'single-use-code', state: 'opaque-state' };
    const subjectDigest = digest('subject', 'unionid:stable-union');
    const provider = { exchangeCode: vi.fn() } as unknown as WechatAuthHttp;
    const { service } = fixture({
      accountId: null,
      attemptCount: 1,
      authUserId: null,
      codeDigest: digest('code', input.code),
      id: input.challengeId,
      purpose: 'login',
      stateDigest: digest('state', input.state),
      status: 'verified',
      subjectDigest,
      verificationExpiresAt: null,
    }, provider);

    await expect((service as unknown as { verifyProviderSubject(value: typeof input, purpose: 'login'): Promise<unknown> })
      .verifyProviderSubject(input, 'login'))
      .resolves.toEqual({ codeDigest: digest('code', input.code), subjectDigest });
    expect(provider.exchangeCode).not.toHaveBeenCalled();
  });

  it('rejects a completed login challenge without exchanging its one-time code again', async () => {
    const input = { challengeId: '10000000-0000-4000-8000-000000000003', code: 'single-use-code', state: 'opaque-state' };
    const subjectDigest = digest('subject', 'unionid:completed-login');
    const provider = { exchangeCode: vi.fn() } as unknown as WechatAuthHttp;
    const { service } = fixture({
      accountId: null,
      attemptCount: 1,
      authUserId: null,
      codeDigest: digest('code', input.code),
      id: input.challengeId,
      purpose: 'login',
      stateDigest: digest('state', input.state),
      status: 'consumed',
      subjectDigest,
      verificationExpiresAt: null,
    }, provider);

    await expect((service as unknown as { verifyProviderSubject(value: typeof input, purpose: 'login'): Promise<unknown> })
      .verifyProviderSubject(input, 'login'))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
        && error.message === 'invalid_wechat_auth_response');
    expect(provider.exchangeCode).not.toHaveBeenCalled();
  });

  it('consumes a verified login challenge before creating a user or issuing a session', async () => {
    const input = { challengeId: '10000000-0000-4000-8000-000000000004', code: 'single-use-code', state: 'opaque-state' };
    const subjectDigest = digest('subject', 'unionid:single-session');
    const provider = { exchangeCode: vi.fn() } as unknown as WechatAuthHttp;
    const { service } = fixture({}, provider);
    const internals = service as unknown as {
      consumeLoginChallenge(challengeId: string, codeDigest: string, subjectDigest: string): Promise<void>;
      consumeRate(): Promise<void>;
      ensureAuthUser(subjectDigest: string): Promise<unknown>;
      issueSession(): Promise<unknown>;
      verifyProviderSubject(): Promise<{ codeDigest: string; subjectDigest: string }>;
    };
    vi.spyOn(internals, 'consumeRate').mockResolvedValue(undefined);
    vi.spyOn(internals, 'verifyProviderSubject').mockResolvedValue({
      codeDigest: digest('code', input.code),
      subjectDigest,
    });
    vi.spyOn(internals, 'consumeLoginChallenge').mockRejectedValue(new ForbiddenException('invalid_wechat_auth_response'));
    const ensureAuthUser = vi.spyOn(internals, 'ensureAuthUser');
    const issueSession = vi.spyOn(internals, 'issueSession');

    await expect(service.complete(input, '203.0.113.8'))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
        && error.message === 'invalid_wechat_auth_response');
    expect(ensureAuthUser).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('issues a ten-minute purpose- and session-bound grant for WeChat phone binding', async () => {
    const input = {
      challengeId: '10000000-0000-4000-8000-000000000005',
      code: 'phone-binding-code',
      purpose: 'phone_binding' as const,
      state: 'phone-binding-state-that-is-long-enough',
    };
    const source = {
      accessToken: 'source-access-token',
      authenticationMethods: [],
      authUserId: '20000000-0000-4000-8000-000000000002',
      identities: [{ provider: 'wechat', subject: 'wechat-subject' }],
      issuedAt: 1_800_000_000,
      sessionId: '20000000-0000-4000-8000-000000000003',
      user: { id: '20000000-0000-4000-8000-000000000001', providers: ['wechat'] },
    } as const;
    const subjectDigest = digest('subject', 'unionid:phone-binding');
    const recentAuth = {
      issueVerifiedGrantInTransaction: vi.fn().mockResolvedValue({
        expiresAt: Date.now() + 600_000,
        grantId: '30000000-0000-4000-8000-000000000001',
        method: 'wechat',
        purpose: 'phone_binding',
      }),
    };
    const selects = [
      [{
        accountId: source.user.id,
        authUserId: source.authUserId,
        id: input.challengeId,
        status: 'verified',
        subjectDigest,
      }],
      [{ authUserId: source.authUserId }],
      [{ accountId: source.user.id }],
    ];
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => query(selects.shift() ?? [])),
      update: vi.fn(() => query([{ id: input.challengeId }])),
    };
    const database = {
      db: {
        transaction: vi.fn(async (operation: (value: typeof transaction) => Promise<unknown>) => operation(transaction)),
      },
    } as unknown as DatabaseService;
    const identities = { hashIdentity: vi.fn().mockReturnValue('identity-hash') };
    const service = new WechatAuthService(config, {} as WechatAuthHttp, database, identities as never, recentAuth as never);
    const internals = service as unknown as {
      consumeRate(): Promise<void>;
      verifyProviderSubject(): Promise<{ codeDigest: string; subjectDigest: string }>;
    };
    vi.spyOn(internals, 'consumeRate').mockResolvedValue(undefined);
    vi.spyOn(internals, 'verifyProviderSubject').mockResolvedValue({
      codeDigest: digest('code', input.code),
      subjectDigest,
    });

    await service.completeRecentAuth(source as never, input, '203.0.113.8');

    const grantCall = recentAuth.issueVerifiedGrantInTransaction.mock.calls[0];
    expect(grantCall?.slice(1, 5)).toEqual([source, 'wechat', 'phone_binding', expect.any(Date)]);
    expect(grantCall?.[5]).toBeInstanceOf(Date);
    expect((grantCall?.[5] as Date).getTime() - (grantCall?.[4] as Date).getTime()).toBe(600_000);
  });

  it('commits a deterministic principal reservation before creating the external auth user and resumes after failure', async () => {
    const subjectDigest = digest('subject', 'unionid:recoverable-user');
    const getUserById = vi.fn().mockResolvedValue({ data: { user: null }, error: { status: 404 } });
    const recoveredUser = {
      id: '',
      email: `wx-${subjectDigest.slice(0, 40)}@wechat-auth.invalid`,
      app_metadata: { icao_identity_provider: 'wechat', icao_wechat_subject: subjectDigest },
    };
    const createUser = vi.fn()
      .mockResolvedValueOnce({ data: { user: null }, error: { message: 'temporary failure' } })
      .mockImplementationOnce(({ id }: { id: string }) => {
        recoveredUser.id = id;
        return Promise.resolve({ data: { user: recoveredUser }, error: null });
      });
    supabase.createClient
      .mockReset()
      .mockReturnValueOnce({ auth: { admin: { createUser, getUserById } } })
      .mockReturnValueOnce({ auth: {} });
    let principalId: string | undefined;
    const insertValues = vi.fn((value: { authUserId: string }) => {
      principalId = value.authUserId;
      return {
        onConflictDoNothing: () => ({ returning: () => Promise.resolve([{ authUserId: value.authUserId }]) }),
      };
    });
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi.fn(() => query([])),
    };
    const update = vi.fn(() => query([]));
    const database = {
      db: {
        transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction)),
        update,
      },
    } as unknown as DatabaseService;
    const instance = new WechatAuthService(config, {} as WechatAuthHttp, database, {} as never, {} as never);
    const ensure = () => (instance as unknown as { ensureAuthUser(value: string): Promise<{ id: string }> })
      .ensureAuthUser(subjectDigest);

    await expect(ensure()).rejects.toSatisfy((error: unknown) => error instanceof ServiceUnavailableException);
    await expect(ensure()).resolves.toEqual(expect.objectContaining({ id: principalId }));
    expect(principalId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(createUser).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: principalId }));
    expect(createUser).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: principalId }));
    expect(insertValues.mock.invocationCallOrder[0]).toBeLessThan(createUser.mock.invocationCallOrder[0]!);
  });

  it('does not create an external auth user when the principal reservation transaction fails', async () => {
    const getUserById = vi.fn();
    const createUser = vi.fn();
    supabase.createClient
      .mockReset()
      .mockReturnValueOnce({ auth: { admin: { createUser, getUserById } } })
      .mockReturnValueOnce({ auth: {} });
    const database = {
      db: { transaction: vi.fn().mockRejectedValue(new Error('database commit failed')) },
    } as unknown as DatabaseService;
    const instance = new WechatAuthService(config, {} as WechatAuthHttp, database, {} as never, {} as never);

    await expect((instance as unknown as { ensureAuthUser(value: string): Promise<unknown> })
      .ensureAuthUser(digest('subject', 'unionid:no-orphan'))).rejects.toThrow('database commit failed');
    expect(createUser).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
  });
});
