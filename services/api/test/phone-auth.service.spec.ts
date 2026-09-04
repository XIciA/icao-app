import { createHmac } from 'node:crypto';

import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PhoneAuthService } from '../src/auth/phone-auth.service';
import type { AccountPhoneIdentityService } from '../src/account/account-phone-identity.service';
import type { VerifiedAuthSession } from '../src/auth/auth.types';
import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({ createClient: supabase.createClient }));

const config = {
  accountIdentityHashSecret: 'test-account-identity-secret-that-is-long-enough',
  supabasePublishableKey: 'test-publishable-key-that-is-long-enough',
  supabaseUrl: 'http://127.0.0.1:8000',
} as ApiConfig;

function service(
  error: { code?: string; message: string } | null = null,
  keepAmbiguousGenerationActive = false,
  intentPurpose: 'login' | 'password_recovery' = 'login',
  deliveryStatus?: 'processing_v2' | 'retryable_v2' | 'rejected_v2' | 'completed_v2',
  accountPhones?: AccountPhoneIdentityService,
) {
  const signInWithOtp = vi.fn().mockResolvedValue({ data: { session: null, user: null }, error });
  const values = vi.fn(() => ({
    returning: vi.fn().mockResolvedValue([{ id: '10000000-0000-4000-8000-000000000010' }]),
  }));
  const updateSet = vi.fn();
  let selectCall = 0;
  const cycle = (dispatchSequence: number) => [
    [], // active dispatch
    [], // active pending/ready
    [{
      dispatchLeaseUntil: new Date('2100-01-01T00:00:00.000Z'),
      dispatchSequence,
      lastAttemptAt: null,
      status: 'queued',
    }],
    [{
      createdAt: new Date('2027-01-15T08:00:00.000Z'),
      dispatchLeaseUntil: new Date('2100-01-01T00:00:00.000Z'),
      dispatchSequence,
      purpose: intentPurpose,
      status: 'dispatching',
    }],
    [], // newer generation
    ...(error ? [[deliveryStatus ? {
      status: deliveryStatus,
      submissionStartedAt: deliveryStatus === 'rejected_v2' ? null : new Date('2027-01-15T08:00:00.000Z'),
    } : undefined].filter(Boolean)] : []),
  ];
  const selectResults = [...cycle(1), ...cycle(2)];
  const transactionApi = {
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn(() => ({ values })),
    select: vi.fn(() => {
      const result = keepAmbiguousGenerationActive && selectCall >= 3
        ? [{ dispatchSequence: 1, id: '10000000-0000-4000-8000-000000000010', status: 'quarantined' }]
        : selectResults[selectCall] ?? [];
      selectCall += 1;
      const terminal = { for: vi.fn().mockResolvedValue(result) };
      const limit = vi.fn(() => terminal);
      const orderBy = vi.fn(() => ({ limit }));
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit, orderBy })),
        })),
      };
    }),
    update: vi.fn(() => ({
      set: vi.fn((value: unknown) => {
        updateSet(value);
        return {
          where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: '10000000-0000-4000-8000-000000000010' }]),
          })),
        };
      }),
    })),
  };
  let activeTransactions = 0;
  const database = {
    db: { transaction: vi.fn(async (operation: (transaction: typeof transactionApi) => unknown) => {
      activeTransactions += 1;
      try {
        return await operation(transactionApi);
      } finally {
        activeTransactions -= 1;
      }
    }) },
  } as unknown as DatabaseService;
  supabase.createClient.mockReturnValue({ auth: { signInWithOtp } });
  return {
    activeTransactions: () => activeTransactions,
    instance: new PhoneAuthService(config, database, accountPhones),
    signInWithOtp,
    updateSet,
    values,
  };
}

async function startRecoveryAt(instance: PhoneAuthService, now: number) {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const pending = instance.startRecovery('+8613800138000', '203.0.113.8');
  await vi.runAllTimersAsync();
  await pending;
  vi.useRealTimers();
}

function verificationService(accountPhones?: AccountPhoneIdentityService) {
  const challengeId = '10000000-0000-4000-8000-000000000010';
  const phone = '+8613800138000';
  const token = '123456';
  const state = {
    attemptCount: 0,
    expiresAt: new Date(Date.now() + 5 * 60 * 1_000),
    id: challengeId,
    otpNotBefore: new Date(Date.now() - 1_000),
    otpTokenDigest: createHmac('sha256', config.accountIdentityHashSecret)
      .update('phone-otp-token-v1\0')
      .update(challengeId)
      .update('\0')
      .update(token)
      .digest('hex'),
    providerRejected: false,
    status: 'ready',
    verificationToken: null as string | null,
  };
  let releaseTail = Promise.resolve();
  const update = (value: Record<string, unknown>) => ({
    where: vi.fn(() => ({
      returning: vi.fn(async () => {
        if (value.status === 'verifying') {
          if (state.status !== 'ready' || state.verificationToken) return [];
        } else if (value.status === 'ready') {
          if (state.status !== 'ready') return [];
        } else if (state.status !== 'verifying') {
          return [];
        }
        Object.assign(state, value);
        return [{ id: challengeId }];
      }),
    })),
  });
  const transactionApi = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({ for: vi.fn(async () => [structuredClone(state)]) })),
        })),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(update) })),
  };
  const database = {
    db: {
      transaction: vi.fn(async (operation: (transaction: typeof transactionApi) => Promise<unknown>) => {
        const predecessor = releaseTail;
        let release!: () => void;
        releaseTail = new Promise<void>((resolve) => { release = resolve; });
        await predecessor;
        try {
          return await operation(transactionApi);
        } finally {
          release();
        }
      }),
      update: vi.fn(() => ({ set: vi.fn(update) })),
    },
  } as unknown as DatabaseService;
  const verifyOtp = vi.fn();
  supabase.createClient.mockReturnValue({ auth: { verifyOtp } });
  return {
    challengeId,
    instance: new PhoneAuthService(config, database, accountPhones),
    phone,
    state,
    token,
    verifyOtp,
  };
}

describe('PhoneAuthService', () => {
  beforeEach(() => supabase.createClient.mockReset());
  afterEach(() => vi.useRealTimers());

  it('starts native +86 OTP registration with the trusted source IP', async () => {
    const { instance, signInWithOtp } = service();
    await expect(instance.start('+8613800138000', '203.0.113.8')).resolves.toEqual(expect.objectContaining({
      accepted: true,
      challengeId: '10000000-0000-4000-8000-000000000010',
      expiresAt: expect.any(Number),
      issuedAt: expect.any(Number),
      resendAllowedAt: expect.any(Number),
      serverTime: expect.any(Number),
    }));
    expect(supabase.createClient).toHaveBeenCalledWith(
      config.supabaseUrl,
      config.supabasePublishableKey,
      expect.objectContaining({ global: { headers: { 'Sb-Forwarded-For': '203.0.113.8' } } }),
    );
    expect(signInWithOtp).toHaveBeenCalledWith({
      phone: '+8613800138000',
      options: {
        channel: 'sms',
        shouldCreateUser: true,
        data: {
          account_type: 'native_phone',
          age_gate: '16_plus',
          password_set: false,
          registration_pending: false,
        },
      },
    });
  });

  it('uses the account-bound phone principal for OTP reauthentication from a WeChat session', async () => {
    const targetAuthUserId = '10000000-0000-4000-8000-000000000020';
    const accountPhones = {
      resolve: vi.fn().mockResolvedValue({
        authUserId: targetAuthUserId,
        passwordSet: true,
        phone: '+8613800138000',
      }),
    } as unknown as AccountPhoneIdentityService;
    const fixture = verificationService(accountPhones);
    fixture.verifyOtp.mockResolvedValue({
      data: {
        session: { access_token: 'access', expires_at: 1_900_000_000, refresh_token: 'refresh' },
        user: { id: targetAuthUserId, phone: fixture.phone },
      },
      error: null,
    });
    const socialSource = {
      accessToken: 'wechat-access',
      authenticationMethods: [{ method: 'wechat', timestamp: Math.floor(Date.now() / 1_000) }],
      authUserId: '20000000-0000-4000-8000-000000000020',
      identities: [{ provider: 'wechat', subject: 'wechat-subject' }],
      issuedAt: Math.floor(Date.now() / 1_000),
      sessionId: '30000000-0000-4000-8000-000000000020',
      user: {
        id: '40000000-0000-4000-8000-000000000020',
        providers: ['wechat', 'phone'],
      },
    } satisfies VerifiedAuthSession;

    await expect(fixture.instance.verifyRecentChallenge(
      socialSource,
      fixture.challengeId,
      fixture.token,
      'account_delete',
      '203.0.113.8',
    )).resolves.toBeUndefined();

    expect(accountPhones.resolve).toHaveBeenCalledWith(socialSource.user.id);
    expect(fixture.verifyOtp).toHaveBeenCalledWith({ phone: fixture.phone, token: fixture.token, type: 'sms' });
    expect(fixture.state.status).toBe('consumed');
  });

  it('returns the same delayed recovery challenge when the phone is unknown', async () => {
    const { instance } = service({ code: 'otp_disabled', message: 'Signups not allowed for otp' }, false, 'password_recovery');
    const startedAt = Date.now();
    await expect(instance.startRecovery('+8613800138000', '203.0.113.8'))
      .resolves.toEqual(expect.objectContaining({ accepted: true, challengeId: expect.any(String) }));
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(300);
  });

  it('hides rate limits and other supplier details behind the same recovery challenge', async () => {
    const rateLimited = service({ code: 'over_sms_send_rate_limit', message: 'supplier detail' }, false, 'password_recovery').instance;
    await expect(rateLimited.startRecovery('+8613800138000', '203.0.113.8'))
      .resolves.toEqual(expect.objectContaining({ accepted: true, challengeId: expect.any(String) }));

    supabase.createClient.mockReset();
    const unavailable = service({ code: 'sms_send_failed', message: 'supplier detail' }, false, 'password_recovery').instance;
    await expect(unavailable.startRecovery('+8613800138000', '203.0.113.8'))
      .resolves.toEqual(expect.objectContaining({ accepted: true, challengeId: expect.any(String) }));
  });

  it('returns recovery responses on the same fixed schedule for fast rejection and slow delivery', async () => {
    vi.useFakeTimers();
    const startedAt = 1_800_000_000_000;
    vi.setSystemTime(startedAt);
    const fast = service(
      { code: 'otp_disabled', message: 'unknown phone' },
      false,
      'password_recovery',
    );
    const fastResponse = fast.instance.startRecovery('+8613800138000', '203.0.113.8');
    await vi.advanceTimersByTimeAsync(349);
    let fastSettled = false;
    void fastResponse.then(() => { fastSettled = true; });
    await Promise.resolve();
    expect(fastSettled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(fastResponse).resolves.toEqual(expect.objectContaining({
      issuedAt: startedAt + 350,
      resendAllowedAt: startedAt + 350 + 60_000,
    }));

    supabase.createClient.mockReset();
    vi.setSystemTime(startedAt + 100_000);
    const slow = service(null, false, 'password_recovery');
    slow.signInWithOtp.mockImplementationOnce(() => new Promise((resolve) => {
      setTimeout(() => resolve({ data: { session: null, user: null }, error: null }), 3_000);
    }));
    const slowResponse = slow.instance.startRecovery('+8613900139000', '203.0.113.8');
    await vi.advanceTimersByTimeAsync(350);
    await expect(slowResponse).resolves.toEqual(expect.objectContaining({
      issuedAt: startedAt + 100_000 + 350,
      resendAllowedAt: startedAt + 100_000 + 350 + 60_000,
    }));
    await vi.advanceTimersByTimeAsync(2_650);
  });

  it('persists purpose-bound login and recovery intents without storing the raw phone', async () => {
    const now = 1_800_000_000_000;
    const login = service();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    await login.instance.start('+8613800138000', '203.0.113.8');
    expect(login.values).toHaveBeenCalledWith(expect.objectContaining({
      accountId: undefined,
      createdAt: new Date(now),
      dispatchLeaseUntil: new Date(now + 30 * 1_000),
      expiresAt: new Date(now + 30 * 1_000 + 5 * 60 * 1_000),
      otpNotBefore: new Date(Math.floor(now / 1_000) * 1_000),
      phoneDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      purpose: 'login',
      status: 'queued',
    }));
    expect(JSON.stringify(login.values.mock.calls)).not.toContain('+8613800138000');
    vi.useRealTimers();

    supabase.createClient.mockReset();
    const { instance, values } = service();
    await startRecoveryAt(instance, now);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      accountId: undefined,
      purpose: 'password_recovery',
    }));
  });

  it('persists a terminal recovery audit intent while returning the non-enumerating challenge', async () => {
    const now = 1_800_000_000_000;
    const { instance, updateSet, values } = service(
      { code: 'otp_disabled', message: 'Signups not allowed for otp' },
      false,
      'password_recovery',
    );
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const pending = instance.startRecovery('+8613800138000', '203.0.113.8');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual(expect.objectContaining({ accepted: true }));
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      accountId: undefined,
      purpose: 'password_recovery',
    }));
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      providerRejected: true,
      status: 'ready',
    }));
  });

  it('fails closed when the normal OTP start cannot reach the supplier', async () => {
    const { instance } = service({ code: 'sms_send_failed', message: 'supplier detail' });
    await expect(instance.start('+8613800138000', '203.0.113.8'))
      .rejects.toSatisfy((error: unknown) => error instanceof ServiceUnavailableException
        && error.message === 'phone_auth_unavailable');
  });

  it('commits an invalid attempt and never calls Supabase for a token from another generation', async () => {
    const challengeId = '10000000-0000-4000-8000-000000000010';
    const verifyOtp = vi.fn();
    const updateSet = vi.fn();
    const intent = {
      attemptCount: 0,
      expiresAt: new Date(Date.now() + 5 * 60 * 1_000),
      id: challengeId,
      otpNotBefore: new Date(Date.now() - 1_000),
      otpTokenDigest: createHmac('sha256', config.accountIdentityHashSecret)
        .update('phone-otp-token-v1\0')
        .update(challengeId)
        .update('\0')
        .update('654321')
        .digest('hex'),
      providerRejected: false,
      status: 'ready',
      verificationToken: null,
    };
    const transactionApi = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({ for: vi.fn().mockResolvedValue([intent]) })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: unknown) => {
          updateSet(value);
          return {
            where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: challengeId }]) })),
          };
        }),
      })),
    };
    const database = {
      db: { transaction: vi.fn(async (operation: (transaction: typeof transactionApi) => unknown) => operation(transactionApi)) },
    } as unknown as DatabaseService;
    supabase.createClient.mockReturnValue({ auth: { verifyOtp } });
    const instance = new PhoneAuthService(config, database);

    await expect(instance.verifyLogin({
      challengeId,
      phone: '+8613800138000',
      purpose: 'login',
      token: '123456',
    }, '203.0.113.8')).rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
      && error.message === 'invalid_phone_otp');
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ attemptCount: 1, status: 'ready' }));
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('uses the full attempt path for a recovery decoy without contacting Supabase', async () => {
    const fixture = verificationService();
    fixture.state.providerRejected = true;
    const request = {
      challengeId: fixture.challengeId,
      phone: fixture.phone,
      purpose: 'recovery' as const,
      token: fixture.token,
    };

    await expect(fixture.instance.verifyLogin(request, '203.0.113.8'))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
        && error.message === 'invalid_phone_otp');
    expect(fixture.state.attemptCount).toBe(1);
    expect(fixture.state.status).toBe('ready');
    expect(fixture.verifyOtp).not.toHaveBeenCalled();
  });

  it('single-flights concurrent verification of the same correct challenge', async () => {
    const fixture = verificationService();
    let settle!: (value: unknown) => void;
    fixture.verifyOtp.mockImplementationOnce(() => new Promise((resolve) => { settle = resolve; }));
    const request = {
      challengeId: fixture.challengeId,
      phone: fixture.phone,
      purpose: 'login' as const,
      token: fixture.token,
    };

    const first = fixture.instance.verifyLogin(request, '203.0.113.8');
    await vi.waitFor(() => expect(fixture.verifyOtp).toHaveBeenCalledTimes(1));
    await expect(fixture.instance.verifyLogin(request, '203.0.113.8'))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
        && error.message === 'invalid_phone_otp');
    expect(fixture.verifyOtp).toHaveBeenCalledTimes(1);

    settle({
      data: {
        session: { access_token: 'access', expires_at: 1_900_000_000, refresh_token: 'refresh' },
        user: { id: '10000000-0000-4000-8000-000000000020', phone: fixture.phone },
      },
      error: null,
    });
    await expect(first).resolves.toEqual({
      session: {
        accessToken: 'access',
        expiresAt: 1_900_000_000,
        refreshToken: 'refresh',
      },
      verified: true,
    });
    expect(fixture.state.status).toBe('consumed');
    expect(fixture.state.verificationToken).toBeNull();
  });

  it('keeps a timed-out verification fenced and settles that exact call when it completes late', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const fixture = verificationService();
    fixture.state.expiresAt = new Date(Date.now() + 5 * 60 * 1_000);
    fixture.state.otpNotBefore = new Date(Date.now() - 1_000);
    let settle!: (value: unknown) => void;
    fixture.verifyOtp.mockImplementationOnce(() => new Promise((resolve) => { settle = resolve; }));
    const request = {
      challengeId: fixture.challengeId,
      phone: fixture.phone,
      purpose: 'login' as const,
      token: fixture.token,
    };

    const first = fixture.instance.verifyLogin(request, '203.0.113.8');
    const failure = expect(first).rejects.toSatisfy((error: unknown) => (
      error instanceof ServiceUnavailableException && error.message === 'phone_auth_unavailable'
    ));
    await vi.advanceTimersByTimeAsync(15_000);
    await failure;
    expect(fixture.state.status).toBe('verifying');
    expect(fixture.state.verificationToken).toMatch(/^[0-9a-f-]{36}$/u);
    await expect(fixture.instance.verifyLogin(request, '203.0.113.8'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(fixture.verifyOtp).toHaveBeenCalledTimes(1);

    settle({
      data: {
        session: { access_token: 'late-access', expires_at: 1_900_000_000, refresh_token: 'late-refresh' },
        user: { id: '10000000-0000-4000-8000-000000000020', phone: fixture.phone },
      },
      error: null,
    });
    await vi.waitFor(() => expect(fixture.state.status).toBe('consumed'));
    expect(fixture.state.verificationToken).toBeNull();
  });

  it('does not hold a database transaction while the SMS provider is pending', async () => {
    const { activeTransactions, instance, signInWithOtp } = service();
    let completeSend!: () => void;
    signInWithOtp.mockImplementationOnce(() => new Promise((resolve) => {
      completeSend = () => resolve({ data: { session: null, user: null }, error: null });
    }));

    const pending = instance.start('+8613800138000', '203.0.113.8');
    for (let attempt = 0; attempt < 20 && signInWithOtp.mock.calls.length === 0; attempt += 1) {
      await Promise.resolve();
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    expect(activeTransactions()).toBe(0);
    completeSend();
    await expect(pending).resolves.toEqual(expect.objectContaining({ accepted: true }));
  });

  it('starts the five-minute challenge TTL when provider delivery completes', async () => {
    vi.useFakeTimers();
    const startedAt = 1_800_000_000_000;
    vi.setSystemTime(startedAt);
    const { instance, signInWithOtp } = service();
    signInWithOtp.mockImplementationOnce(() => new Promise((resolve) => {
      setTimeout(() => resolve({ data: { session: null, user: null }, error: null }), 10_000);
    }));

    const pending = instance.start('+8613800138000', '203.0.113.8');
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual(expect.objectContaining({
      expiresAt: startedAt + 10_000 + 5 * 60 * 1_000,
      issuedAt: startedAt + 10_000,
      resendAllowedAt: startedAt + 10_000 + 60 * 1_000,
    }));
  });

  it('hard-times out an ambiguous provider send after releasing every database connection', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const { activeTransactions, instance, signInWithOtp, updateSet } = service(null, true);
    signInWithOtp.mockImplementationOnce(() => new Promise(() => undefined));

    const pending = instance.start('+8613800138000', '203.0.113.8');
    const rejection = expect(pending).rejects.toSatisfy((error: unknown) => error instanceof ServiceUnavailableException
      && error.message === 'phone_auth_unavailable');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    expect(activeTransactions()).toBe(0);
    const dispatchClaim = updateSet.mock.calls.find(([value]) => (
      value as { status?: string }
    ).status === 'dispatching')?.[0] as { dispatchLeaseUntil?: Date } | undefined;
    expect(dispatchClaim?.dispatchLeaseUntil?.getTime()).toBe(
      1_800_000_000_000 + 15_000 + 5 * 60 * 1_000 + 2 * 60 * 1_000,
    );

    await expect(instance.start('+8613800138000', '203.0.113.8'))
      .rejects.toSatisfy((error: unknown) => error instanceof Error && error.message === 'phone_otp_rate_limited');
    expect(signInWithOtp).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1_000 + 1);
    await expect(instance.start('+8613800138000', '203.0.113.8'))
      .rejects.toSatisfy((error: unknown) => error instanceof Error && error.message === 'phone_otp_rate_limited');
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it('masks an ambiguous recovery timeout and every blocked retry without disclosing the active challenge', async () => {
    vi.useFakeTimers();
    const startedAt = 1_800_000_000_000;
    vi.setSystemTime(startedAt);
    const { instance, signInWithOtp } = service(null, true);
    signInWithOtp.mockImplementationOnce(() => new Promise(() => undefined));

    const pending = instance.startRecovery('+8613800138000', '203.0.113.8');
    await vi.advanceTimersByTimeAsync(350);
    await expect(pending).resolves.toEqual(expect.objectContaining({
      accepted: true,
      expiresAt: startedAt + 350 + 5 * 60 * 1_000,
      issuedAt: startedAt + 350,
    }));
    // Even after the normal resend cooldown, an ambiguously delivered
    // generation remains quarantined rather than becoming distinguishable.
    await vi.advanceTimersByTimeAsync(61_000 - 350);
    const retryStartedAt = Date.now();
    const retry = instance.startRecovery('+8613800138000', '203.0.113.8');
    await vi.advanceTimersByTimeAsync(350);
    await expect(retry).resolves.toEqual(expect.objectContaining({
      accepted: true,
      challengeId: expect.not.stringMatching(/^10000000-0000-4000-8000-000000000010$/u),
      issuedAt: retryStartedAt + 350,
    }));
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it('pads a stateless recovery decoy verification and never calls Supabase', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({ for: vi.fn().mockResolvedValue([]) })),
          })),
        })),
      })),
    };
    const database = {
      db: { transaction: vi.fn(async (operation: (value: typeof transaction) => Promise<unknown>) => operation(transaction)) },
    } as unknown as DatabaseService;
    const verifyOtp = vi.fn();
    supabase.createClient.mockReturnValue({ auth: { verifyOtp } });
    const instance = new PhoneAuthService(config, database);
    const result = instance.verifyLogin({
      challengeId: '10000000-0000-4000-8000-000000000099',
      phone: '+8613800138000',
      purpose: 'recovery',
      token: '123456',
    }, '203.0.113.8').then(() => undefined, (error: unknown) => error);

    await vi.advanceTimersByTimeAsync(349);
    let settled = false;
    void result.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toSatisfy((error: unknown) => error instanceof ForbiddenException
      && error.message === 'invalid_phone_otp');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('keeps an observed continuation and promotes a quarantined generation after a late success', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const { instance, signInWithOtp, updateSet } = service();
    let settle!: (value: { data: { session: null; user: null }; error: null }) => void;
    signInWithOtp.mockImplementationOnce(() => new Promise((resolve) => { settle = resolve; }));

    const operation = instance.start('+8613800138000', '203.0.113.8');
    const result = operation.then(() => undefined, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toBeInstanceOf(ServiceUnavailableException);
    settle({ data: { session: null, user: null }, error: null });
    await vi.waitFor(() => expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' })));
    const pendingUpdate = updateSet.mock.calls.find(([value]) => (value as { status?: string }).status === 'ready')?.[0] as {
      expiresAt: Date;
      providerCompletedAt: Date;
    };
    expect(pendingUpdate.expiresAt.getTime() - pendingUpdate.providerCompletedAt.getTime()).toBe(5 * 60 * 1_000);
  });

  it('keeps an observed continuation quarantined after an ambiguous late outer failure', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const { instance, signInWithOtp, updateSet } = service();
    let settle!: (value: { data: { session: null; user: null }; error: { code: string; message: string } }) => void;
    signInWithOtp.mockImplementationOnce(() => new Promise((resolve) => { settle = resolve; }));

    const operation = instance.start('+8613800138000', '203.0.113.8');
    const result = operation.then(() => undefined, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toBeInstanceOf(ServiceUnavailableException);
    settle({ data: { session: null, user: null }, error: { code: 'sms_send_failed', message: 'failed' } });
    await vi.waitFor(() => expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'quarantined' })));
  });

  it('keeps completed hook delivery quarantined when the outer provider call fails', async () => {
    const fixture = service(
      { code: 'sms_send_failed', message: 'outer transaction rolled back' },
      false,
      'login',
      'completed_v2',
    );

    await expect(fixture.instance.start('+8613800138000', '203.0.113.8'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fixture.updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'quarantined' }));
  });

  it('releases only an exact locally-persisted pre-submission rejection', async () => {
    const fixture = service(
      { code: 'hook_failed', message: 'local counter rejected before Aliyun' },
      false,
      'password_recovery',
      'rejected_v2',
    );

    await expect(fixture.instance.startRecovery('+8613800138000', '203.0.113.8'))
      .resolves.toEqual(expect.objectContaining({ accepted: true }));
    await vi.waitFor(() => expect(fixture.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      providerRejected: true,
      status: 'ready',
    })));
    expect(fixture.updateSet).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'quarantined' }));
  });

  it('releases database connections before five independent hanging supplier calls', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const fixtures = Array.from({ length: 5 }, () => service());
    for (const fixture of fixtures) {
      fixture.signInWithOtp.mockImplementationOnce(() => new Promise(() => undefined));
    }
    supabase.createClient.mockReset();
    for (const fixture of fixtures) {
      supabase.createClient.mockReturnValueOnce({ auth: { signInWithOtp: fixture.signInWithOtp } });
    }

    const pending = fixtures.map((fixture, index) => fixture.instance.start(
      `+8613800138${String(index).padStart(3, '0')}`,
      '203.0.113.8',
    ));
    const rejections = pending.map((request) => expect(request).rejects.toSatisfy((error: unknown) => (
      error instanceof ServiceUnavailableException && error.message === 'phone_auth_unavailable'
    )));
    for (let attempt = 0; attempt < 30 && fixtures.some((fixture) => fixture.signInWithOtp.mock.calls.length === 0); attempt += 1) {
      await Promise.resolve();
    }
    expect(fixtures.map((fixture) => fixture.activeTransactions())).toEqual([0, 0, 0, 0, 0]);
    await vi.advanceTimersByTimeAsync(15_000);
    await Promise.all(rejections);
  });

  it('commits the verification fence before a terminal provider rejection', async () => {
    const transactionSet = vi.fn();
    const terminalSet = vi.fn();
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              for: vi.fn().mockResolvedValue([{
                attemptCount: 5,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 60_000),
                id: '10000000-0000-4000-8000-000000000010',
                otpTokenDigest: createHmac('sha256', config.accountIdentityHashSecret)
                  .update('phone-otp-token-v1\0')
                  .update('10000000-0000-4000-8000-000000000010')
                  .update('\0')
                  .update('123456')
                  .digest('hex'),
                providerRejected: false,
                status: 'ready',
                verificationToken: null,
              }]),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: unknown) => {
          transactionSet(value);
          return {
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([{ id: '10000000-0000-4000-8000-000000000010' }]),
            })),
          };
        }),
      })),
    };
    const database = {
      db: {
        transaction: vi.fn(async (operation: (value: typeof transaction) => Promise<unknown>) => operation(transaction)),
        update: vi.fn(() => ({
          set: vi.fn((value: unknown) => {
            terminalSet(value);
            return {
              where: vi.fn(() => ({
                returning: vi.fn().mockResolvedValue([{ id: '10000000-0000-4000-8000-000000000010' }]),
              })),
            };
          }),
        })),
      },
    } as unknown as DatabaseService;
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: { code: 'otp_expired', message: 'invalid' },
    });
    supabase.createClient.mockReturnValueOnce({ auth: { verifyOtp } });
    const instance = new PhoneAuthService(config, database);

    await expect(instance.verifyLogin({
      challengeId: '10000000-0000-4000-8000-000000000010',
      phone: '+8613800138000',
      purpose: 'login',
      token: '123456',
    }, '203.0.113.8')).rejects.toBeInstanceOf(ForbiddenException);

    expect(transactionSet).toHaveBeenCalledWith(expect.objectContaining({
      attemptCount: 6,
      lastAttemptAt: expect.any(Date),
      status: 'verifying',
      verificationToken: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    }));
    expect(terminalSet).toHaveBeenCalledWith({ status: 'failed', verificationToken: null });
  });
});
