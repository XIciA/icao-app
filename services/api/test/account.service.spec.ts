import { ConflictException, HttpException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountIdentityService } from '../src/account/account-identity.service';
import { AccountService } from '../src/account/account.service';
import type { AuthVerifier, VerifiedAuthSession } from '../src/auth/auth.types';
import type { PhoneAuthService } from '../src/auth/phone-auth.service';
import type { SessionSecurityService } from '../src/auth/session-security.service';
import type { RecentSocialAuthGrantService } from '../src/auth/recent-social-auth-grant.service';
import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';
import type { FeedbackService } from '../src/feedback/feedback.service';

const supabase = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabase.createClient,
}));

function session(options: {
  accountId: string;
  authenticationMethods?: VerifiedAuthSession['authenticationMethods'];
  authUserId: string;
  issuedAt?: number;
  passwordSet?: boolean;
  phone?: string;
  providers: Array<'apple' | 'phone' | 'wechat'>;
}): VerifiedAuthSession {
  const timestamp = options.issuedAt ?? Math.floor(Date.now() / 1_000);
  const defaultMethod = options.providers.includes('apple') ? 'oauth' : 'otp';
  return {
    accessToken: `${options.authUserId}-access-token`,
    authenticationMethods: options.authenticationMethods ?? [{ method: defaultMethod, timestamp }],
    authUserId: options.authUserId,
    identities: [],
    issuedAt: options.issuedAt ?? Math.floor(Date.now() / 1_000),
    passwordSet: options.passwordSet,
    sessionId: `${options.authUserId}-session`,
    user: {
      id: options.accountId,
      authUserId: options.authUserId,
      phone: options.phone,
      providers: options.providers,
    },
  };
}

function fixture(options: {
  hasWechatGrant?: boolean;
  hasRecoveryGrant?: boolean;
  phoneAccountId?: string | null;
  signInWithOtp?: ReturnType<typeof vi.fn>;
  signInWithPassword?: ReturnType<typeof vi.fn>;
  transaction?: ReturnType<typeof vi.fn>;
  verifyOtp?: ReturnType<typeof vi.fn>;
} = {}) {
  const verifyOtp = options.verifyOtp ?? vi.fn().mockResolvedValue({
    data: {
      session: {
        access_token: 'phone-session-access-token',
        expires_at: 1_800_003_600,
        refresh_token: 'phone-session-refresh-token',
      },
      user: {
        id: 'phone-auth-user',
        phone: '+8613800138000',
      },
    },
    error: null,
  });
  const signInWithOtp = options.signInWithOtp ?? vi.fn().mockResolvedValue({
    data: { session: null, user: null },
    error: null,
  });
  const signInWithPassword = options.signInWithPassword ?? vi.fn().mockResolvedValue({
    data: {
      session: {
        access_token: 'new-password-access-token',
        expires_at: 1_800_003_600,
        refresh_token: 'new-password-refresh-token',
      },
      user: {
        id: '22222222-2222-4222-8222-222222222222',
        phone: '+8613800138000',
      },
    },
    error: null,
  });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  supabase.createClient
    .mockReturnValueOnce({ auth: { admin: { signOut } } })
    .mockReturnValueOnce({ auth: { signInWithOtp, signInWithPassword, verifyOtp } })
    .mockReturnValue({ auth: { signInWithOtp, signInWithPassword, verifyOtp } });

  const target = session({
    accountId: '22222222-2222-4222-8222-222222222222',
    authUserId: '22222222-2222-4222-8222-222222222222',
    phone: '+8613800138000',
    providers: ['phone'],
  });
  const verifier = {
    verify: vi.fn().mockResolvedValue(target),
  };
  const identities = {
    accountIdForIdentity: vi.fn().mockResolvedValue(
      options.phoneAccountId === null
        ? undefined
        : options.phoneAccountId ?? '22222222-2222-4222-8222-222222222222',
    ),
    authUserIdsForAccount: vi.fn().mockResolvedValue(['11111111-1111-4111-8111-111111111111']),
    hashIdentity: vi.fn().mockReturnValue('a'.repeat(64)),
    providersForAccount: vi.fn().mockResolvedValue(['phone']),
    resolve: vi.fn().mockResolvedValue(target.user),
  };
  const sessions = {
    assertActive: vi.fn().mockResolvedValue(undefined),
    revokeAll: vi.fn().mockResolvedValue(undefined),
  };
  const recentSocialAuth = {
    consume: vi.fn().mockReturnValue(options.hasWechatGrant ?? true),
    has: vi.fn().mockReturnValue(options.hasWechatGrant ?? true),
  };
  const phoneAuth = {
    authorizePasswordRecovery: vi.fn().mockReturnValue({ authorized: true, expiresAt: Date.now() + 600_000 }),
    consumePasswordRecovery: vi.fn().mockReturnValue(options.hasRecoveryGrant ?? true),
  };
  const transaction = options.transaction ?? vi.fn().mockRejectedValue(new Error('merge_transaction_failed'));
  const database = { db: { transaction } };
  const feedback = {};
  const service = new AccountService(
    {
      supabasePublishableKey: 'test-publishable-key-that-is-long-enough',
      supabaseSecretKey: 'test-secret-key-that-is-long-enough',
      supabaseUrl: 'http://127.0.0.1:8000',
    } as ApiConfig,
    verifier as unknown as AuthVerifier,
    database as unknown as DatabaseService,
    identities as unknown as AccountIdentityService,
    phoneAuth as unknown as PhoneAuthService,
    recentSocialAuth as unknown as RecentSocialAuthGrantService,
    sessions as unknown as SessionSecurityService,
    feedback as FeedbackService,
  );
  return {
    identities,
    phoneAuth,
    service,
    recentSocialAuth,
    sessions,
    signInWithOtp,
    signInWithPassword,
    signOut,
    target,
    transaction,
    verifier,
    verifyOtp,
  };
}

describe('AccountService phone merge', () => {
  beforeEach(() => {
    supabase.createClient.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('rejects a source that already has a phone without consuming another OTP', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      phone: '+8613900139000',
      providers: ['phone', 'wechat'],
    });
    const { service, verifyOtp } = fixture();

    await expect(service.mergeWithPhoneOtp(source, '+8613800138000', '123456'))
      .rejects.toSatisfy((error: unknown) => error instanceof ConflictException
        && error.message === 'account_phone_identity_conflict');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('rejects a non-social source without consuming an OTP', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: [],
    });
    const { service, verifyOtp } = fixture();

    await expect(service.mergeWithPhoneOtp(source, '+8613800138000', '123456'))
      .rejects.toSatisfy((error: unknown) => error instanceof UnauthorizedException
        && error.message === 'social_identity_required');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('requires a recent social login before consuming a phone OTP', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      issuedAt: Math.floor(Date.now() / 1_000) - (11 * 60),
      providers: ['apple'],
    });
    const { service, verifyOtp } = fixture();

    await expect(service.mergeWithPhoneOtp(source, '+8613800138000', '123456'))
      .rejects.toSatisfy((error: unknown) => error instanceof UnauthorizedException
        && error.message === 'recent_social_auth_required');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('does not mistake a refreshed access token for recent user authentication', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authenticationMethods: [{ method: 'oauth', timestamp: Math.floor(Date.now() / 1_000) - (11 * 60) }],
      authUserId: '11111111-1111-4111-8111-111111111111',
      issuedAt: Math.floor(Date.now() / 1_000),
      providers: ['apple'],
    });
    const { service, verifyOtp } = fixture();

    await expect(service.mergeWithPhoneOtp(source, '+8613800138000', '123456'))
      .rejects.toSatisfy((error: unknown) => error instanceof UnauthorizedException
        && error.message === 'recent_social_auth_required');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('does not accept a new TOTP step as a recent Apple login', async () => {
    const now = Math.floor(Date.now() / 1_000);
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authenticationMethods: [
        { method: 'oauth', provider: 'apple', timestamp: now - (11 * 60) },
        { method: 'totp', timestamp: now },
      ],
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: ['apple'],
    });
    const { service, verifyOtp } = fixture();

    await expect(service.mergeWithPhoneOtp(source, '+8613800138000', '123456'))
      .rejects.toSatisfy((error: unknown) => error instanceof UnauthorizedException
        && error.message === 'recent_social_auth_required');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('starts a neutral phone-binding OTP for a recent social session', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: ['apple'],
    });
    const { service, signInWithOtp } = fixture({ hasWechatGrant: false });

    await expect(service.startPhoneBinding(source, '+8613800138000', '203.0.113.9')).resolves.toEqual({ sent: true });
    expect(supabase.createClient).toHaveBeenLastCalledWith(
      'http://127.0.0.1:8000',
      'test-publishable-key-that-is-long-enough',
      expect.objectContaining({ global: { headers: { 'Sb-Forwarded-For': '203.0.113.9' } } }),
    );
    expect(signInWithOtp).toHaveBeenCalledWith({
      phone: '+8613800138000',
      options: {
        channel: 'sms',
        shouldCreateUser: true,
        data: { account_type: 'native_phone_binding_target' },
      },
    });
  });

  it('rejects a stale social session before sending a phone-binding OTP', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      issuedAt: Math.floor(Date.now() / 1_000) - (11 * 60),
      providers: ['wechat'],
    });
    const { service, signInWithOtp } = fixture({ hasWechatGrant: false });

    await expect(service.startPhoneBinding(source, '+8613800138000'))
      .rejects.toSatisfy((error: unknown) => error instanceof UnauthorizedException
        && error.message === 'recent_social_auth_required');
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('maps phone-binding supplier errors to stable neutral responses', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: ['wechat'],
    });
    const rateLimited = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: { code: 'over_sms_send_rate_limit', message: 'supplier detail' },
    });
    const unavailable = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: { code: 'sms_send_failed', message: 'supplier detail' },
    });

    const rateLimitedService = fixture({ signInWithOtp: rateLimited }).service;
    await expect(rateLimitedService.startPhoneBinding(source, '+8613800138000'))
      .rejects.toSatisfy((error: unknown) => error instanceof HttpException
        && error.getStatus() === 429
        && error.message === 'phone_binding_otp_rate_limited');

    supabase.createClient.mockReset();
    const unavailableService = fixture({ signInWithOtp: unavailable }).service;
    await expect(unavailableService.startPhoneBinding(source, '+8613800138000'))
      .rejects.toSatisfy((error: unknown) => error instanceof ServiceUnavailableException
        && error.message === 'phone_binding_otp_unavailable');
  });

  it('does not resolve or merge an account when Supabase rejects the phone OTP', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: new Error('invalid otp'),
    });
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: ['wechat'],
    });
    const { identities, service, transaction, verifier } = fixture({ verifyOtp });

    await expect(service.mergeWithPhoneOtp(source, '+8613800138000', '000000'))
      .rejects.toSatisfy((error: unknown) => error instanceof UnauthorizedException
        && error.message === 'invalid_phone_otp');
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(identities.resolve).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('verifies the phone session before the merge and revokes it locally if the transaction fails', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: ['wechat'],
    });
    const { identities, service, sessions, signOut, transaction, verifier, verifyOtp } = fixture();

    await expect(service.mergeWithPhoneOtp(source, '+8613800138000', '123456'))
      .rejects.toThrow('merge_transaction_failed');

    expect(verifyOtp).toHaveBeenCalledWith({
      phone: '+8613800138000',
      token: '123456',
      type: 'sms',
    });
    expect(verifier.verify).toHaveBeenCalledWith('phone-session-access-token');
    expect(sessions.assertActive).toHaveBeenCalledOnce();
    expect(identities.resolve).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledWith('phone-session-access-token', 'local');
  });

  it('binds an unused verified phone to the existing social account without changing its accountId', async () => {
    const rows = [
      [{ status: 'active' }],
      [],
      [],
    ];
    const inserted: unknown[] = [];
    const fluent = <T,>(result: T) => {
      const query = {
        from: vi.fn(),
        limit: vi.fn(),
        then: undefined as unknown,
        values: vi.fn(),
        where: vi.fn(),
      };
      query.from.mockReturnValue(query);
      query.limit.mockReturnValue(query);
      query.values.mockImplementation((value: unknown) => {
        inserted.push(value);
        return query;
      });
      query.where.mockReturnValue(query);
      query.then = (resolve: (value: T) => unknown, reject: (cause: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
      return query;
    };
    const transactionApi = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn(() => fluent(undefined)),
      select: vi.fn(() => fluent(rows.shift() ?? [])),
      selectDistinct: vi.fn(() => fluent([{ provider: 'wechat' }, { provider: 'phone' }])),
    };
    const transaction = vi.fn(async (operation: (value: typeof transactionApi) => Promise<unknown>) => operation(transactionApi));
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: ['wechat'],
    });
    const { identities, service, signOut } = fixture({ phoneAccountId: null, transaction });

    await expect(service.mergeWithPhoneOtp(source, '+8613800138000', '123456')).resolves.toEqual({
      account: {
        accountId: source.user.id,
        phone: '+8613800138000',
        phoneBound: true,
        providers: ['phone', 'wechat'],
      },
      session: {
        accessToken: 'phone-session-access-token',
        expiresAt: 1_800_003_600,
        refreshToken: 'phone-session-refresh-token',
      },
    });
    expect(identities.resolve).not.toHaveBeenCalled();
    expect(inserted).toContainEqual({
      accountId: source.user.id,
      authUserId: '22222222-2222-4222-8222-222222222222',
      provider: 'phone',
      subjectHash: 'a'.repeat(64),
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('updates a password only through the internal Auth endpoint after a recent phone OTP', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const source = session({
      accountId: '22222222-2222-4222-8222-222222222222',
      authUserId: '22222222-2222-4222-8222-222222222222',
      passwordSet: false,
      phone: '+8613800138000',
      providers: ['phone'],
    });
    const { phoneAuth, service, signInWithPassword, signOut } = fixture();

    await expect(service.updatePassword(source, 'newpassword10')).resolves.toEqual({
      session: {
        accessToken: 'new-password-access-token',
        expiresAt: 1_800_003_600,
        refreshToken: 'new-password-refresh-token',
      },
      updated: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:8000/auth/v1/user'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          password: 'newpassword10',
          data: { password_set: true, registration_pending: false },
        }),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ authorization: `Bearer ${source.accessToken}` }),
    }));
    expect(phoneAuth.consumePasswordRecovery).not.toHaveBeenCalled();
    expect(signInWithPassword).toHaveBeenCalledOnce();
    expect(signInWithPassword).toHaveBeenCalledWith({ phone: '+8613800138000', password: 'newpassword10' });
    expect(signOut).toHaveBeenCalledWith(source.accessToken, 'local');
  });

  it('atomically checks the current password with the current session before returning a new session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const source = session({
      accountId: '22222222-2222-4222-8222-222222222222',
      authUserId: '22222222-2222-4222-8222-222222222222',
      authenticationMethods: [],
      phone: '+8613800138000',
      providers: ['phone'],
    });
    const { service, signInWithPassword } = fixture();

    await expect(service.updatePassword(source, 'newpassword10', 'oldpassword10')).resolves.toEqual({
      session: {
        accessToken: 'new-password-access-token',
        expiresAt: 1_800_003_600,
        refreshToken: 'new-password-refresh-token',
      },
      updated: true,
    });
    expect(signInWithPassword).toHaveBeenCalledOnce();
    expect(signInWithPassword).toHaveBeenCalledWith({ phone: '+8613800138000', password: 'newpassword10' });
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ authorization: `Bearer ${source.accessToken}` }),
      body: JSON.stringify({
        password: 'newpassword10',
        current_password: 'oldpassword10',
        data: { password_set: true, registration_pending: false },
      }),
    }));
  });

  it('requires and consumes a purpose-bound recovery grant for an existing password', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const source = session({
      accountId: '22222222-2222-4222-8222-222222222222',
      authUserId: '22222222-2222-4222-8222-222222222222',
      passwordSet: true,
      phone: '+8613800138000',
      providers: ['phone'],
    });
    const { phoneAuth, service, signInWithPassword } = fixture({ hasRecoveryGrant: false });

    await expect(service.updatePassword(source, 'newpassword10'))
      .rejects.toSatisfy((error: unknown) => error instanceof UnauthorizedException
        && error.message === 'phone_reauthentication_required');
    expect(phoneAuth.consumePasswordRecovery).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('globally revokes old sessions before signing in after a password recovery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const source = session({
      accountId: '22222222-2222-4222-8222-222222222222',
      authUserId: '22222222-2222-4222-8222-222222222222',
      passwordSet: true,
      phone: '+8613800138000',
      providers: ['phone'],
    });
    const { phoneAuth, service, sessions, signInWithPassword, signOut } = fixture();

    await expect(service.updatePassword(source, 'newpassword10')).resolves.toEqual(expect.objectContaining({
      session: expect.objectContaining({ accessToken: 'new-password-access-token' }),
      updated: true,
    }));
    expect(phoneAuth.consumePasswordRecovery).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledWith(source.accessToken, 'global');
    expect(sessions.revokeAll).toHaveBeenCalledWith(source.authUserId);
    expect(signInWithPassword).toHaveBeenCalledWith({ phone: '+8613800138000', password: 'newpassword10' });
    expect(signOut).not.toHaveBeenCalledWith(source.accessToken, 'local');
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(signInWithPassword.mock.invocationCallOrder[0]!);
    expect(sessions.revokeAll.mock.invocationCallOrder[0]).toBeLessThan(signInWithPassword.mock.invocationCallOrder[0]!);
  });

  it('maps upstream reauthentication requirements to the stable recovery error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ code: 'reauthentication_needed' }),
    }));
    const source = session({
      accountId: '22222222-2222-4222-8222-222222222222',
      authenticationMethods: [],
      authUserId: '22222222-2222-4222-8222-222222222222',
      passwordSet: true,
      phone: '+8613800138000',
      providers: ['phone'],
    });
    const { service, signInWithPassword } = fixture();

    await expect(service.updatePassword(source, 'newpassword10', 'oldpassword10'))
      .rejects.toSatisfy((error: unknown) => error instanceof UnauthorizedException
        && error.message === 'phone_reauthentication_required');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects password setup when the phone OTP session is stale', async () => {
    const source = session({
      accountId: '22222222-2222-4222-8222-222222222222',
      authUserId: '22222222-2222-4222-8222-222222222222',
      authenticationMethods: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1_000) - (11 * 60) }],
      phone: '+8613800138000',
      providers: ['phone'],
    });
    const { service } = fixture();

    await expect(service.updatePassword(source, 'newpassword10'))
      .rejects.toSatisfy((error: unknown) => error instanceof UnauthorizedException
        && error.message === 'phone_reauthentication_required');
  });
});
