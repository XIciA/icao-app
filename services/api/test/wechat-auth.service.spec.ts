import { createHmac } from 'node:crypto';

import { ServiceUnavailableException } from '@nestjs/common';
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
});
