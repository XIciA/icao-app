import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PhoneAuthService } from '../src/auth/phone-auth.service';
import type { VerifiedAuthSession } from '../src/auth/auth.types';
import type { ApiConfig } from '../src/config';

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({ createClient: supabase.createClient }));

const config = {
  accountIdentityHashSecret: 'test-account-identity-secret-that-is-long-enough',
  supabasePublishableKey: 'test-publishable-key-that-is-long-enough',
  supabaseUrl: 'http://127.0.0.1:8000',
} as ApiConfig;

function service(error: { code?: string; message: string } | null = null) {
  const signInWithOtp = vi.fn().mockResolvedValue({ data: { session: null, user: null }, error });
  supabase.createClient.mockReturnValueOnce({ auth: { signInWithOtp } });
  return { instance: new PhoneAuthService(config), signInWithOtp };
}

function authSession(options: {
  authUserId?: string;
  phone?: string;
  sessionId?: string;
  timestamp: number;
}): VerifiedAuthSession {
  const authUserId = options.authUserId ?? '11111111-1111-4111-8111-111111111111';
  return {
    accessToken: 'access-token',
    authenticationMethods: [{ method: 'otp', timestamp: options.timestamp }],
    authUserId,
    identities: [{ provider: 'phone', subject: options.phone ?? '+8613800138000' }],
    issuedAt: options.timestamp,
    passwordSet: true,
    sessionId: options.sessionId ?? '22222222-2222-4222-8222-222222222222',
    user: {
      authUserId,
      id: authUserId,
      phone: options.phone ?? '+8613800138000',
      providers: ['phone'],
    },
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
          age_gate: '14_plus',
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

  it('issues a short grant only for an OTP session created after the recovery request and consumes it once', async () => {
    const now = 1_800_000_000_000;
    const { instance } = service();
    await startRecoveryAt(instance, now);
    const recoverySession = authSession({ timestamp: Math.floor(now / 1_000) + 2 });

    expect(instance.authorizePasswordRecovery(recoverySession, now + 2_000)).toEqual({
      authorized: true,
      expiresAt: now + 2_000 + (10 * 60 * 1_000),
    });
    expect(instance.consumePasswordRecovery(recoverySession, now + 2_001)).toBe(true);
    expect(instance.consumePasswordRecovery(recoverySession, now + 2_002)).toBe(false);
  });

  it('rejects an OTP session that predates the latest recovery request', async () => {
    const now = 1_800_000_000_000;
    const { instance } = service();
    await startRecoveryAt(instance, now);

    expect(() => instance.authorizePasswordRecovery(
      authSession({ timestamp: Math.floor(now / 1_000) }),
      now + 2_000,
    )).toThrowError(expect.objectContaining({
      constructor: UnauthorizedException,
      message: 'phone_reauthentication_required',
    }));
  });

  it('does not grant recovery when the unknown-phone send was rejected upstream', async () => {
    const now = 1_800_000_000_000;
    const { instance } = service({ code: 'otp_disabled', message: 'Signups not allowed for otp' });
    await startRecoveryAt(instance, now);

    expect(() => instance.authorizePasswordRecovery(
      authSession({ timestamp: Math.floor(now / 1_000) + 2 }),
      now + 2_000,
    )).toThrow('phone_reauthentication_required');
  });

  it('expires both pending recovery requests and issued grants', async () => {
    const now = 1_800_000_000_000;
    const { instance } = service();
    await startRecoveryAt(instance, now);
    const recoverySession = authSession({ timestamp: Math.floor(now / 1_000) + 2 });

    expect(() => instance.authorizePasswordRecovery(
      recoverySession,
      now + (10 * 60 * 1_000) + 1,
    )).toThrow('phone_reauthentication_required');

    supabase.createClient.mockReturnValueOnce({
      auth: { signInWithOtp: vi.fn().mockResolvedValue({ data: { session: null, user: null }, error: null }) },
    });
    await startRecoveryAt(instance, now + (20 * 60 * 1_000));
    const laterSession = authSession({ timestamp: Math.floor(now / 1_000) + (20 * 60) + 2 });
    instance.authorizePasswordRecovery(laterSession, now + (20 * 60 * 1_000) + 2_000);
    expect(instance.consumePasswordRecovery(
      laterSession,
      now + (30 * 60 * 1_000) + 2_001,
    )).toBe(false);
  });

  it('fails closed when the normal OTP start cannot reach the supplier', async () => {
    const { instance } = service({ code: 'sms_send_failed', message: 'supplier detail' });
    await expect(instance.start('+8613800138000', '203.0.113.8'))
      .rejects.toSatisfy((error: unknown) => error instanceof ServiceUnavailableException
        && error.message === 'phone_auth_unavailable');
  });
});
