import { ConflictException, ForbiddenException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountIdentityService } from '../src/account/account-identity.service';
import type { AccountPhoneIdentityService } from '../src/account/account-phone-identity.service';
import { AccountService } from '../src/account/account.service';
import type { AuthVerifier, VerifiedAuthSession } from '../src/auth/auth.types';
import type { PhoneAuthService } from '../src/auth/phone-auth.service';
import type { RecentAuthService } from '../src/auth/recent-auth.service';
import type { SessionSecurityService } from '../src/auth/session-security.service';
import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';

const PHONE_BINDING_CHALLENGE_ID = '55555555-5555-4555-8555-555555555555';

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
  consumeOtpIntentError?: Error;
  hasRecoveryGrant?: boolean;
  phoneAccountId?: string | null;
  signInWithOtp?: ReturnType<typeof vi.fn>;
  signInWithPassword?: ReturnType<typeof vi.fn>;
  signOut?: ReturnType<typeof vi.fn>;
  startBindingError?: Error;
  transaction?: ReturnType<typeof vi.fn>;
  verifyBindingError?: Error;
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
        id: '22222222-2222-4222-8222-222222222222',
        // GoTrue persists Chinese phone identities without the leading plus.
        phone: '8613800138000',
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
        phone: '8613800138000',
      },
    },
    error: null,
  });
  const signOut = options.signOut ?? vi.fn().mockResolvedValue({ error: null });
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
    claimLifetimeTrialInTransaction: vi.fn().mockResolvedValue(undefined),
    hashIdentity: vi.fn().mockReturnValue('a'.repeat(64)),
    providersForAccount: vi.fn().mockResolvedValue(['phone']),
    resolve: vi.fn().mockResolvedValue(target.user),
  };
  const sessions = {
    assertActive: vi.fn().mockResolvedValue(undefined),
    revokeAll: vi.fn().mockResolvedValue(undefined),
    revokeAllInTransaction: vi.fn().mockResolvedValue(undefined),
  };
  const accountPhones = {
    resolve: vi.fn().mockResolvedValue({
      authUserId: '22222222-2222-4222-8222-222222222222',
      passwordSet: true,
      phone: '+8613800138000',
    }),
  };
  const phoneAuth = {
    consumeOtpIntent: options.consumeOtpIntentError
      ? vi.fn().mockRejectedValue(options.consumeOtpIntentError)
      : vi.fn().mockResolvedValue(undefined),
    consumeOtpIntentInTransaction: options.consumeOtpIntentError
      ? vi.fn().mockRejectedValue(options.consumeOtpIntentError)
      : vi.fn().mockResolvedValue(undefined),
    redeemRecoveryIntentInTransaction: vi.fn().mockResolvedValue(undefined),
    startBinding: options.startBindingError
      ? vi.fn().mockRejectedValue(options.startBindingError)
      : vi.fn().mockResolvedValue({ sent: true }),
    verifyBindingChallenge: options.verifyBindingError
      ? vi.fn().mockRejectedValue(options.verifyBindingError)
      : vi.fn().mockResolvedValue({
        accessToken: 'phone-session-access-token',
        expiresAt: 1_800_003_600,
        refreshToken: 'phone-session-refresh-token',
      }),
  };
  const recentAuth = {
    assertValid: vi.fn().mockResolvedValue(undefined),
    reserve: options.hasRecoveryGrant === false
      ? vi.fn().mockRejectedValue(new ForbiddenException('phone_reauthentication_required'))
      : vi.fn().mockResolvedValue('44444444-4444-4444-8444-444444444444'),
    commitReservation: vi.fn().mockResolvedValue(undefined),
    releaseReservation: vi.fn().mockResolvedValue(undefined),
    issuePhoneOtpGrant: vi.fn().mockResolvedValue({
      expiresAt: Date.now() + 300_000,
      grantId: '33333333-3333-4333-8333-333333333333',
      method: 'phone_otp',
      purpose: 'password_recovery',
    }),
    issueVerifiedGrantInTransaction: vi.fn().mockResolvedValue({
      expiresAt: Date.now() + 300_000,
      grantId: '33333333-3333-4333-8333-333333333333',
      method: 'phone_otp',
      purpose: 'password_recovery',
    }),
    consumeInTransaction: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn().mockResolvedValue(undefined),
  };
  const transaction = options.transaction ?? vi.fn().mockRejectedValue(new Error('binding_transaction_failed'));
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const database = { db: { transaction, update: vi.fn().mockReturnValue({ set: updateSet }) } };
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
    recentAuth as unknown as RecentAuthService,
    sessions as unknown as SessionSecurityService,
    accountPhones as unknown as AccountPhoneIdentityService,
  );
  return {
    accountPhones,
    identities,
    phoneAuth,
    recentAuth,
    service,
    sessions,
    signInWithOtp,
    signInWithPassword,
    signOut,
    target,
    transaction,
    updateWhere,
    verifier,
    verifyOtp,
  };
}

describe('AccountService phone binding', () => {
  beforeEach(() => {
    supabase.createClient.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('requires and consumes a session-bound grant before revoking every linked principal', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: ['wechat'],
    });
    const transactionApi = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    };
    const transaction = vi.fn(async (operation: (value: typeof transactionApi) => Promise<unknown>) => (
      operation(transactionApi)
    ));
    const result = fixture({ transaction });
    result.identities.authUserIdsForAccount.mockResolvedValue([
      source.authUserId,
      '22222222-2222-4222-8222-222222222222',
    ]);

    await expect(result.service.revokeAll(
      source,
      '33333333-3333-4333-8333-333333333333',
    )).resolves.toEqual({ revoked: true });

    expect(result.recentAuth.consumeInTransaction).toHaveBeenCalledWith(
      transactionApi,
      source,
      '33333333-3333-4333-8333-333333333333',
      'session_revoke_all',
    );
    expect(result.sessions.revokeAllInTransaction).toHaveBeenNthCalledWith(1, transactionApi, source.authUserId);
    expect(result.sessions.revokeAllInTransaction).toHaveBeenCalledWith(
      transactionApi,
      '22222222-2222-4222-8222-222222222222',
    );
    expect(result.recentAuth.consumeInTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      result.sessions.revokeAllInTransaction.mock.invocationCallOrder[0]!,
    );
    expect(result.sessions.revokeAll).not.toHaveBeenCalled();
  });

  it('rejects a source that already has a phone without consuming another OTP', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      phone: '+8613900139000',
      providers: ['phone', 'apple'],
    });
    const { service, verifyOtp } = fixture();

    await expect(service.bindPhoneWithOtp(source, PHONE_BINDING_CHALLENGE_ID, '+8613800138000', '123456'))
      .rejects.toSatisfy((error: unknown) => error instanceof ConflictException
        && error.message === 'invalid_phone_binding');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('rejects a non-social source without consuming an OTP', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: [],
    });
    const { service, verifyOtp } = fixture();

    await expect(service.bindPhoneWithOtp(source, PHONE_BINDING_CHALLENGE_ID, '+8613800138000', '123456'))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
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

    await expect(service.bindPhoneWithOtp(source, PHONE_BINDING_CHALLENGE_ID, '+8613800138000', '123456'))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
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

    await expect(service.bindPhoneWithOtp(source, PHONE_BINDING_CHALLENGE_ID, '+8613800138000', '123456'))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
        && error.message === 'recent_social_auth_required');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('does not mistake a refreshed WeChat access token for recent user authentication', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authenticationMethods: [],
      authUserId: '11111111-1111-4111-8111-111111111111',
      issuedAt: Math.floor(Date.now() / 1_000),
      providers: ['wechat'],
    });
    const { phoneAuth, recentAuth, service } = fixture();

    await expect(service.startPhoneBinding(source, '+8613800138000'))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
        && error.message === 'recent_social_auth_required');
    expect(recentAuth.assertValid).not.toHaveBeenCalled();
    expect(phoneAuth.startBinding).not.toHaveBeenCalled();
  });

  it('accepts a session-bound WeChat phone-binding grant without relying on access-token iat', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authenticationMethods: [],
      authUserId: '11111111-1111-4111-8111-111111111111',
      issuedAt: Math.floor(Date.now() / 1_000),
      providers: ['wechat'],
    });
    const { phoneAuth, recentAuth, service } = fixture();
    const grantId = '66666666-6666-4666-8666-666666666666';

    await expect(service.startPhoneBinding(source, '+8613800138000', '203.0.113.9', grantId))
      .resolves.toEqual({ sent: true });
    expect(recentAuth.assertValid).toHaveBeenCalledWith(source, grantId, 'phone_binding', 'wechat');
    expect(phoneAuth.startBinding).toHaveBeenCalledWith(source, '+8613800138000', '203.0.113.9');
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

    await expect(service.bindPhoneWithOtp(source, PHONE_BINDING_CHALLENGE_ID, '+8613800138000', '123456'))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
        && error.message === 'recent_social_auth_required');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('starts a neutral phone-binding OTP for a recent social session', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: ['apple'],
    });
    const { phoneAuth, service } = fixture();

    await expect(service.startPhoneBinding(source, '+8613800138000', '203.0.113.9')).resolves.toEqual({ sent: true });
    expect(phoneAuth.startBinding).toHaveBeenCalledWith(source, '+8613800138000', '203.0.113.9');
  });

  it('rejects a stale social session before sending a phone-binding OTP', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      issuedAt: Math.floor(Date.now() / 1_000) - (11 * 60),
      providers: ['apple'],
    });
    const { service, signInWithOtp } = fixture();

    await expect(service.startPhoneBinding(source, '+8613800138000'))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
        && error.message === 'recent_social_auth_required');
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('maps phone-binding supplier errors to stable neutral responses', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: ['apple'],
    });
    const rateLimitedService = fixture({
      startBindingError: new HttpException('phone_binding_otp_rate_limited', 429),
    }).service;
    await expect(rateLimitedService.startPhoneBinding(source, '+8613800138000'))
      .rejects.toSatisfy((error: unknown) => error instanceof HttpException
        && error.getStatus() === 429
        && error.message === 'phone_binding_otp_rate_limited');

    const unavailableService = fixture({
      startBindingError: new ServiceUnavailableException('phone_binding_otp_unavailable'),
    }).service;
    await expect(unavailableService.startPhoneBinding(source, '+8613800138000'))
      .rejects.toSatisfy((error: unknown) => error instanceof ServiceUnavailableException
        && error.message === 'phone_binding_otp_unavailable');
  });

  it('does not bind an account when Supabase rejects the phone OTP', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: ['apple'],
    });
    const { identities, phoneAuth, service, transaction, verifier } = fixture({
      verifyBindingError: new ForbiddenException('invalid_phone_otp'),
    });

    await expect(service.bindPhoneWithOtp(source, PHONE_BINDING_CHALLENGE_ID, '+8613800138000', '000000'))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
        && error.message === 'invalid_phone_otp');
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(phoneAuth.verifyBindingChallenge).toHaveBeenCalledWith(
      source,
      PHONE_BINDING_CHALLENGE_ID,
      '+8613800138000',
      '000000',
      '127.0.0.1',
    );
    expect(identities.resolve).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('verifies the phone session before binding and revokes it locally if the transaction fails', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: ['apple'],
    });
    const { identities, phoneAuth, service, sessions, signOut, transaction, verifier } = fixture();

    await expect(service.bindPhoneWithOtp(source, PHONE_BINDING_CHALLENGE_ID, '+8613800138000', '123456'))
      .rejects.toThrow('binding_transaction_failed');

    expect(phoneAuth.verifyBindingChallenge).toHaveBeenCalledWith(
      source,
      PHONE_BINDING_CHALLENGE_ID,
      '+8613800138000',
      '123456',
      '127.0.0.1',
    );
    expect(verifier.verify).toHaveBeenCalledWith('phone-session-access-token');
    expect(sessions.assertActive).not.toHaveBeenCalled();
    expect(identities.resolve).not.toHaveBeenCalled();
    expect(phoneAuth.consumeOtpIntent).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledWith('phone-session-access-token', 'local');
  });

  it('binds only through the exact purpose-bound challenge without re-consuming an AMR timestamp', async () => {
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: ['apple'],
    });
    const { phoneAuth, service, target } = fixture();
    target.authenticationMethods = [{ method: 'otp', timestamp: Math.floor(Date.now() / 1_000) - 3_600 }];
    await expect(service.bindPhoneWithOtp(source, PHONE_BINDING_CHALLENGE_ID, '+8613800138000', '123456'))
      .rejects.toThrow('binding_transaction_failed');
    expect(phoneAuth.verifyBindingChallenge).toHaveBeenCalledWith(
      source,
      PHONE_BINDING_CHALLENGE_ID,
      '+8613800138000',
      '123456',
      '127.0.0.1',
    );
    expect(phoneAuth.consumeOtpIntent).not.toHaveBeenCalled();
  });

  it('normalizes the GoTrue phone representation before binding it to the social account', async () => {
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
    const { identities, phoneAuth, recentAuth, service, signOut } = fixture({ phoneAccountId: null, transaction });
    const grantId = '66666666-6666-4666-8666-666666666666';

    await expect(service.bindPhoneWithOtp(
      source,
      PHONE_BINDING_CHALLENGE_ID,
      '+8613800138000',
      '123456',
      '127.0.0.1',
      grantId,
    )).resolves.toEqual({
      account: {
        accountId: source.user.id,
        phone: '+8613800138000',
        phoneBound: true,
        hasPassword: false,
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
    expect(identities.claimLifetimeTrialInTransaction).toHaveBeenCalledWith(
      transactionApi,
      [{ provider: 'phone', subject: '+8613800138000' }],
      source.user.id,
      expect.any(Date),
      false,
    );
    expect(recentAuth.assertValid).toHaveBeenCalledWith(source, grantId, 'phone_binding', 'wechat');
    expect(recentAuth.consumeInTransaction).toHaveBeenCalledWith(
      transactionApi,
      source,
      grantId,
      'phone_binding',
    );
    expect(phoneAuth.verifyBindingChallenge).toHaveBeenCalledOnce();
    expect(phoneAuth.consumeOtpIntent).not.toHaveBeenCalled();
    expect(phoneAuth.consumeOtpIntentInTransaction).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'phone subject is already occupied',
      rows: [[{ status: 'active' }], [{ accountId: 'occupied-account' }]],
    },
    {
      name: 'verified auth user maps inconsistently',
      rows: [[{ status: 'active' }], [], [{ accountId: 'occupied-account' }], []],
    },
    {
      name: 'source acquired a phone concurrently',
      rows: [[{ status: 'active' }], [], [], [{ accountId: 'source-account' }]],
    },
  ])('consumes the OTP and returns the same neutral conflict when $name', async ({ rows }) => {
    const inserted: unknown[] = [];
    const results = [...rows];
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
      select: vi.fn(() => fluent(results.shift() ?? [])),
      selectDistinct: vi.fn(() => fluent([])),
    };
    const transaction = vi.fn(async (operation: (value: typeof transactionApi) => Promise<unknown>) => operation(transactionApi));
    const source = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: ['apple'],
    });
    const { identities, phoneAuth, service, signOut } = fixture({ transaction });

    await expect(service.bindPhoneWithOtp(source, PHONE_BINDING_CHALLENGE_ID, '+8613800138000', '123456'))
      .rejects.toSatisfy((error: unknown) => error instanceof ConflictException
        && error.getStatus() === 409
        && error.message === 'phone_already_registered');

    expect(phoneAuth.verifyBindingChallenge).toHaveBeenCalledOnce();
    expect(phoneAuth.consumeOtpIntent).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith('phone-session-access-token', 'local');
    expect(identities.claimLifetimeTrialInTransaction).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });

  it('serializes concurrent claims so only one account can bind the phone', async () => {
    let occupied = false;
    let transactionQueue = Promise.resolve();
    const inserted: unknown[] = [];
    const transaction = vi.fn(<T,>(operation: (value: unknown) => Promise<T>) => {
      const current = transactionQueue.then(async () => {
        let selectCall = 0;
        const fluent = <R,>(result: R) => {
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
            occupied = true;
            return query;
          });
          query.where.mockReturnValue(query);
          query.then = (resolve: (value: R) => unknown, reject: (cause: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
          return query;
        };
        const transactionApi = {
          execute: vi.fn().mockResolvedValue(undefined),
          insert: vi.fn(() => fluent(undefined)),
          select: vi.fn(() => {
            selectCall += 1;
            if (selectCall === 1) return fluent([{ status: 'active' }]);
            if (selectCall === 2) return fluent(occupied ? [{ accountId: 'winner' }] : []);
            return fluent([]);
          }),
          selectDistinct: vi.fn(() => fluent([{ provider: 'apple' }, { provider: 'phone' }])),
        };
        return operation(transactionApi);
      });
      transactionQueue = current.then(() => undefined, () => undefined);
      return current;
    });
    const firstSource = session({
      accountId: '11111111-1111-4111-8111-111111111111',
      authUserId: '11111111-1111-4111-8111-111111111111',
      providers: ['apple'],
    });
    const secondSource = session({
      accountId: '33333333-3333-4333-8333-333333333333',
      authUserId: '33333333-3333-4333-8333-333333333333',
      providers: ['apple'],
    });
    const { service, signOut } = fixture({ transaction });

    const results = await Promise.allSettled([
      service.bindPhoneWithOtp(firstSource, PHONE_BINDING_CHALLENGE_ID, '+8613800138000', '123456'),
      service.bindPhoneWithOtp(secondSource, PHONE_BINDING_CHALLENGE_ID, '+8613800138000', '654321'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected?.reason).toSatisfy((error: unknown) => error instanceof ConflictException
      && error.message === 'phone_already_registered');
    expect(inserted).toHaveLength(1);
    expect(signOut).toHaveBeenCalledTimes(1);
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
    expect(phoneAuth.consumeOtpIntent).not.toHaveBeenCalled();
    expect(signInWithPassword).toHaveBeenCalledOnce();
    expect(signInWithPassword).toHaveBeenCalledWith({ phone: '+8613800138000', password: 'newpassword10' });
    expect(signOut).toHaveBeenCalledWith(source.accessToken, 'local');
  });

  it('atomically redeems the exact consumed recovery challenge into one grant', async () => {
    const transactionApi = {};
    const transaction = vi.fn(async (operation: (value: typeof transactionApi) => Promise<unknown>) => (
      operation(transactionApi)
    ));
    const source = session({
      accountId: '22222222-2222-4222-8222-222222222222',
      authUserId: '22222222-2222-4222-8222-222222222222',
      phone: '+8613800138000',
      providers: ['phone'],
    });
    const { phoneAuth, recentAuth, service } = fixture({ transaction });

    await expect(service.authorizePasswordRecovery(source, PHONE_BINDING_CHALLENGE_ID))
      .resolves.toEqual(expect.objectContaining({
        authorized: true,
        grantId: '33333333-3333-4333-8333-333333333333',
      }));
    expect(phoneAuth.redeemRecoveryIntentInTransaction).toHaveBeenCalledWith(
      transactionApi,
      source,
      PHONE_BINDING_CHALLENGE_ID,
    );
    expect(recentAuth.issueVerifiedGrantInTransaction).toHaveBeenCalledWith(
      transactionApi,
      source,
      'phone_otp',
      'password_recovery',
      expect.any(Date),
    );
    expect(transaction).toHaveBeenCalledOnce();
    expect(recentAuth.issuePhoneOtpGrant).not.toHaveBeenCalled();
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
    const { recentAuth, service, signInWithPassword } = fixture({ hasRecoveryGrant: false });

    await expect(service.updatePassword(
      source,
      'newpassword10',
      undefined,
      '33333333-3333-4333-8333-333333333333',
    ))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
        && error.message === 'phone_reauthentication_required');
    expect(recentAuth.reserve).toHaveBeenCalledWith(
      source,
      '33333333-3333-4333-8333-333333333333',
      'password_recovery',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('locally revokes old sessions before provider cleanup and signing in after password recovery', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const source = session({
      accountId: '22222222-2222-4222-8222-222222222222',
      authUserId: '22222222-2222-4222-8222-222222222222',
      passwordSet: true,
      phone: '+8613800138000',
      providers: ['phone'],
    });
    const { recentAuth, service, sessions, signInWithPassword, signOut } = fixture();

    await expect(service.updatePassword(
      source,
      'newpassword10',
      undefined,
      '33333333-3333-4333-8333-333333333333',
    )).resolves.toEqual(expect.objectContaining({
      session: expect.objectContaining({ accessToken: 'new-password-access-token' }),
      updated: true,
    }));
    expect(recentAuth.reserve).toHaveBeenCalledOnce();
    expect(recentAuth.commitReservation).toHaveBeenCalledWith(
      source,
      '33333333-3333-4333-8333-333333333333',
      'password_recovery',
      '44444444-4444-4444-8444-444444444444',
    );
    expect(signOut).toHaveBeenCalledWith(source.accessToken, 'global');
    expect(sessions.revokeAll).toHaveBeenCalledWith(source.authUserId);
    expect(signInWithPassword).toHaveBeenCalledWith({ phone: '+8613800138000', password: 'newpassword10' });
    expect(signOut).not.toHaveBeenCalledWith(source.accessToken, 'local');
    expect(sessions.revokeAll.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]!);
    expect(sessions.revokeAll.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]!);
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(signInWithPassword.mock.invocationCallOrder[0]!);
    expect(sessions.revokeAll.mock.invocationCallOrder[0]).toBeLessThan(signInWithPassword.mock.invocationCallOrder[0]!);
  });

  it('keeps the old bearer locally revoked when every provider sign-out retry fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const source = session({
      accountId: '22222222-2222-4222-8222-222222222222',
      authUserId: '22222222-2222-4222-8222-222222222222',
      passwordSet: true,
      phone: '+8613800138000',
      providers: ['phone'],
    });
    let oldBearerRevoked = false;
    const signOut = vi.fn().mockImplementation(async () => {
      expect(oldBearerRevoked).toBe(true);
      return { error: { message: 'provider unavailable' } };
    });
    const fixtureResult = fixture({ signOut });
    fixtureResult.sessions.revokeAll.mockImplementation(async () => {
      oldBearerRevoked = true;
    });

    await expect(fixtureResult.service.updatePassword(
      source,
      'newpassword10',
      undefined,
      '33333333-3333-4333-8333-333333333333',
    )).resolves.toEqual(expect.objectContaining({
      session: expect.objectContaining({ accessToken: 'new-password-access-token' }),
      updated: true,
    }));

    expect(oldBearerRevoked).toBe(true);
    expect(signOut).toHaveBeenCalledTimes(3);
    expect(fixtureResult.sessions.revokeAll).toHaveBeenCalledWith(source.authUserId);
    expect(fixtureResult.signInWithPassword).toHaveBeenCalledOnce();
  });

  it('releases a recovery grant reservation when the password update fails upstream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ code: 'weak_password' }),
    }));
    const source = session({
      accountId: '22222222-2222-4222-8222-222222222222',
      authUserId: '22222222-2222-4222-8222-222222222222',
      passwordSet: true,
      phone: '+8613800138000',
      providers: ['phone'],
    });
    const { recentAuth, service, sessions } = fixture();

    await expect(service.updatePassword(
      source,
      'weakpassword',
      undefined,
      '33333333-3333-4333-8333-333333333333',
    )).rejects.toSatisfy((error: unknown) => error instanceof HttpException
      && error.message === 'invalid_phone_password');
    expect(recentAuth.releaseReservation).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    );
    expect(recentAuth.commitReservation).not.toHaveBeenCalled();
    expect(sessions.revokeAll).toHaveBeenCalledWith(source.authUserId);
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
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
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
    const { service } = fixture({
      consumeOtpIntentError: new ForbiddenException('phone_reauthentication_required'),
    });

    await expect(service.updatePassword(source, 'newpassword10'))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
        && error.message === 'phone_reauthentication_required');
  });
});
