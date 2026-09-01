import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PhoneAuthService } from '../src/auth/phone-auth.service';
import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({ createClient: supabase.createClient }));

const config = {
  accountIdentityHashSecret: 'test-account-identity-secret-that-is-long-enough',
  supabasePublishableKey: 'test-publishable-key-that-is-long-enough',
  supabaseUrl: 'http://127.0.0.1:8000',
} as ApiConfig;

function service(error: { code?: string; message: string } | null = null) {
  const signInWithOtp = vi.fn().mockResolvedValue({ data: { session: null, user: null }, error });
  const values = vi.fn(() => ({
    returning: vi.fn().mockResolvedValue([{ id: '10000000-0000-4000-8000-000000000010' }]),
  }));
  let selectCall = 0;
  const selectResults = [
    [],
    [{
      dispatchLeaseUntil: new Date('2100-01-01T00:00:00.000Z'),
      dispatchSequence: 1,
      lastAttemptAt: null,
      status: 'queued',
    }],
    [{ dispatchSequence: 1, status: 'dispatching' }],
    [],
    [{
      dispatchLeaseUntil: new Date('2100-01-01T00:00:00.000Z'),
      dispatchSequence: 2,
      lastAttemptAt: null,
      status: 'queued',
    }],
    [{ dispatchSequence: 2, status: 'dispatching' }],
    [],
  ];
  const transactionApi = {
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn(() => ({ values })),
    select: vi.fn(() => {
      const result = selectResults[selectCall++] ?? [];
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
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: '10000000-0000-4000-8000-000000000010' }]),
        })),
      })),
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
    instance: new PhoneAuthService(config, database),
    signInWithOtp,
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

  it('returns the same accepted recovery shape when the phone is unknown', async () => {
    const { instance } = service({ code: 'otp_disabled', message: 'Signups not allowed for otp' });
    const startedAt = Date.now();
    await expect(instance.startRecovery('+8613800138000', '203.0.113.8')).resolves.toEqual(expect.objectContaining({ accepted: true }));
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(300);
  });

  it('hides rate limits and other supplier errors behind the same recovery response', async () => {
    const rateLimited = service({ code: 'over_sms_send_rate_limit', message: 'supplier detail' }).instance;
    await expect(rateLimited.startRecovery('+8613800138000', '203.0.113.8'))
      .resolves.toEqual(expect.objectContaining({ accepted: true }));

    supabase.createClient.mockReset();
    const unavailable = service({ code: 'sms_send_failed', message: 'supplier detail' }).instance;
    await expect(unavailable.startRecovery('+8613800138000', '203.0.113.8')).resolves.toEqual(expect.objectContaining({ accepted: true }));
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

  it('persists a neutral recovery challenge even when the unknown-phone send was rejected upstream', async () => {
    const now = 1_800_000_000_000;
    const { instance, values } = service({ code: 'otp_disabled', message: 'Signups not allowed for otp' });
    await startRecoveryAt(instance, now);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      accountId: undefined,
      purpose: 'password_recovery',
    }));
  });

  it('fails closed when the normal OTP start cannot reach the supplier', async () => {
    const { instance } = service({ code: 'sms_send_failed', message: 'supplier detail' });
    await expect(instance.start('+8613800138000', '203.0.113.8'))
      .rejects.toSatisfy((error: unknown) => error instanceof ServiceUnavailableException
        && error.message === 'phone_auth_unavailable');
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
    const { activeTransactions, instance, signInWithOtp } = service();
    signInWithOtp.mockImplementationOnce(() => new Promise(() => undefined));

    const pending = instance.start('+8613800138000', '203.0.113.8');
    const rejection = expect(pending).rejects.toSatisfy((error: unknown) => error instanceof ServiceUnavailableException
      && error.message === 'phone_auth_unavailable');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    expect(activeTransactions()).toBe(0);

    await expect(instance.start('+8613800138000', '203.0.113.8'))
      .rejects.toSatisfy((error: unknown) => error instanceof Error && error.message === 'phone_otp_rate_limited');
    expect(signInWithOtp).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1_000 + 1);
    await expect(instance.start('+8613800138000', '203.0.113.8'))
      .resolves.toEqual(expect.objectContaining({ accepted: true }));
    expect(signInWithOtp).toHaveBeenCalledTimes(2);
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

  it('commits every invalid attempt before rejecting and marks the terminal attempt outside the transaction', async () => {
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
                status: 'pending',
              }]),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: unknown) => {
          transactionSet(value);
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    };
    const database = {
      db: {
        transaction: vi.fn(async (operation: (value: typeof transaction) => Promise<unknown>) => operation(transaction)),
        update: vi.fn(() => ({
          set: vi.fn((value: unknown) => {
            terminalSet(value);
            return { where: vi.fn().mockResolvedValue(undefined) };
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
    }));
    expect(terminalSet).toHaveBeenCalledWith({ status: 'failed' });
  });
});
