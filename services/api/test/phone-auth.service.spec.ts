import { ServiceUnavailableException } from '@nestjs/common';
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
  const values = vi.fn().mockResolvedValue(undefined);
  const transactionApi = {
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn(() => ({ values })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    })),
  };
  const database = {
    db: { transaction: vi.fn(async (operation: (transaction: typeof transactionApi) => unknown) => operation(transactionApi)) },
  } as unknown as DatabaseService;
  supabase.createClient.mockReturnValueOnce({ auth: { signInWithOtp } });
  return { instance: new PhoneAuthService(config, database), signInWithOtp, values };
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
    await expect(instance.start('+8613800138000', '203.0.113.8')).resolves.toEqual({ accepted: true });
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
    await expect(instance.startRecovery('+8613800138000', '203.0.113.8')).resolves.toEqual({ accepted: true });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(300);
  });

  it('hides rate limits and other supplier errors behind the same recovery response', async () => {
    const rateLimited = service({ code: 'over_sms_send_rate_limit', message: 'supplier detail' }).instance;
    await expect(rateLimited.startRecovery('+8613800138000', '203.0.113.8'))
      .resolves.toEqual({ accepted: true });

    supabase.createClient.mockReset();
    const unavailable = service({ code: 'sms_send_failed', message: 'supplier detail' }).instance;
    await expect(unavailable.startRecovery('+8613800138000', '203.0.113.8')).resolves.toEqual({ accepted: true });
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
      otpNotBefore: new Date(Math.floor(now / 1_000) * 1_000),
      phoneDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      purpose: 'login',
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

  it('does not persist a recovery intent when the unknown-phone send was rejected upstream', async () => {
    const now = 1_800_000_000_000;
    const { instance, values } = service({ code: 'otp_disabled', message: 'Signups not allowed for otp' });
    await startRecoveryAt(instance, now);
    expect(values).not.toHaveBeenCalled();
  });

  it('fails closed when the normal OTP start cannot reach the supplier', async () => {
    const { instance } = service({ code: 'sms_send_failed', message: 'supplier detail' });
    await expect(instance.start('+8613800138000', '203.0.113.8'))
      .rejects.toSatisfy((error: unknown) => error instanceof ServiceUnavailableException
        && error.message === 'phone_auth_unavailable');
  });
});
