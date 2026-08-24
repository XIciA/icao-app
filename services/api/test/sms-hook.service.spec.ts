import { describe, expect, it, vi } from 'vitest';
import { Webhook } from 'standardwebhooks';
import { ServiceUnavailableException } from '@nestjs/common';

import { submitAliyunOtp, type AliyunSmsProvider } from '../src/auth/sms/aliyun-sms.provider';
import type { SmsDeliveryAuthority } from '../src/auth/sms/sms-delivery-authority';
import { SupabaseSmsHookController } from '../src/auth/sms/supabase-sms-hook.controller';
import { SupabaseSmsHookService } from '../src/auth/sms/supabase-sms-hook.service';
import { loadConfig, type ApiConfig } from '../src/config';

const signingSecret = `v1,whsec_${Buffer.from('icao-sms-hook-test-secret-32-byte').toString('base64')}`;

function config(overrides: NodeJS.ProcessEnv = {}): ApiConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:test@127.0.0.1:5432/postgres',
    SUPABASE_URL: 'http://127.0.0.1:8000',
    SUPABASE_PUBLIC_URL: 'http://127.0.0.1:8000',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key-that-is-long-enough',
    SUPABASE_SECRET_KEY: 'test-secret-key-that-is-long-enough',
    INVITE_AUTH_SECRET: 'test-invite-auth-secret-that-is-long-enough',
    ACCOUNT_IDENTITY_HASH_SECRET: 'test-account-identity-secret-that-is-long-enough',
    SMS_PROVIDER: 'aliyun',
    ALIYUN_SMS_ACCESS_KEY_ID: 'test-access-key-id',
    ALIYUN_SMS_ACCESS_KEY_SECRET: 'test-access-key-secret-value',
    ALIYUN_SMS_SIGN_NAME: '云启航科成都',
    ALIYUN_SMS_TEMPLATE_CODE: 'SMS_123456789',
    SUPABASE_SMS_HOOK_SECRET: signingSecret,
    ...overrides,
  });
}

function signedHook(payload: object, id = 'msg_test_1') {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const timestamp = new Date();
  const verifier = new Webhook(signingSecret.replace(/^v1,/u, ''));
  return {
    rawBody,
    headers: {
      'webhook-id': id,
      'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1_000)),
      'webhook-signature': verifier.sign(id, timestamp, rawBody),
    },
  };
}

function smsPayload(phone = '+8613800138000', otp = '123456') {
  return { user: { id: 'user-1', phone }, sms: { otp, phone } };
}

function hookService(apiConfig: ApiConfig, provider: AliyunSmsProvider) {
  const deliveries = new Map<string, 'processing' | 'completed'>();
  const authority = {
    claim: vi.fn(async (dedupeKey: string) => {
      const existing = deliveries.get(dedupeKey);
      if (existing === 'completed') return { outcome: 'duplicate_completed' as const };
      if (existing === 'processing') return { outcome: 'duplicate_inflight' as const };
      deliveries.set(dedupeKey, 'processing');
      return { leaseToken: '11111111-1111-4111-8111-111111111111', outcome: 'claimed' as const, rules: [] };
    }),
    complete: vi.fn(async (dedupeKey: string) => { deliveries.set(dedupeKey, 'completed'); }),
    fail: vi.fn(async (dedupeKey: string) => { deliveries.delete(dedupeKey); }),
  };
  return new SupabaseSmsHookService(apiConfig, provider, authority as unknown as SmsDeliveryAuthority);
}

describe('Supabase SMS hook', () => {
  it('deduplicates the same signed phone and OTP across different webhook IDs', async () => {
    const provider = { sendOtp: vi.fn().mockResolvedValue({ requestId: 'request-1' }) };
    const service = hookService(config(), provider as unknown as AliyunSmsProvider);
    const first = signedHook(smsPayload(), 'msg_retry_1');
    const retry = signedHook(smsPayload(), 'msg_retry_2');

    await service.handle(first.rawBody, first.headers);
    await service.handle(retry.rawBody, retry.headers);

    expect(provider.sendOtp).toHaveBeenCalledTimes(1);
    expect(provider.sendOtp).toHaveBeenCalledWith(expect.objectContaining({
      outId: expect.stringMatching(/^[a-f0-9]{64}$/u),
      phone: '+8613800138000',
      otp: '123456',
    }));
  });

  it('shares one provider submission across concurrent webhook retries', async () => {
    let completeSubmission: ((value: object) => void) | undefined;
    const provider = {
      sendOtp: vi.fn().mockImplementation(() => new Promise((resolve) => { completeSubmission = resolve; })),
    };
    const service = hookService(config(), provider as unknown as AliyunSmsProvider);
    const first = signedHook(smsPayload(), 'msg_concurrent_1');
    const retry = signedHook(smsPayload(), 'msg_concurrent_2');

    const firstOperation = service.handle(first.rawBody, first.headers);
    const retryOperation = service.handle(retry.rawBody, retry.headers);
    const retryExpectation = expect(retryOperation).rejects.toSatisfy((error: unknown) => (
      error instanceof ServiceUnavailableException && error.message === 'sms_delivery_in_progress'
    ));
    await vi.waitFor(() => expect(provider.sendOtp).toHaveBeenCalledTimes(1));
    completeSubmission?.({ requestId: 'request-1' });
    await retryExpectation;
    await firstOperation;

    expect(provider.sendOtp).toHaveBeenCalledTimes(1);
  });

  it('uses sms.phone when a first-signup hook does not yet expose a user', async () => {
    const provider = { sendOtp: vi.fn().mockResolvedValue({ requestId: 'request-1' }) };
    const service = hookService(config(), provider as unknown as AliyunSmsProvider);
    const hook = signedHook({
      metadata: { name: 'send-sms' },
      sms: { otp: '123456', phone: '8613800138000' },
    });

    await service.handle(hook.rawBody, hook.headers);

    expect(provider.sendOtp).toHaveBeenCalledWith(expect.objectContaining({
      phone: '+8613800138000',
      otp: '123456',
    }));
  });

  it('rejects a hook when user.phone and sms.phone disagree', async () => {
    const provider = { sendOtp: vi.fn() };
    const service = hookService(config(), provider as unknown as AliyunSmsProvider);
    const hook = signedHook({
      user: { id: 'user-1', phone: '+8613800138000' },
      sms: { otp: '123456', phone: '+8613900139000' },
    });

    await expect(service.handle(hook.rawBody, hook.headers))
      .rejects.toMatchObject({ status: 400 });
    expect(provider.sendOtp).not.toHaveBeenCalled();
  });

  it('fails closed for an invalid signature or non-mainland phone', async () => {
    const provider = { sendOtp: vi.fn() };
    const service = hookService(config(), provider as unknown as AliyunSmsProvider);
    const invalidSignature = signedHook(smsPayload());
    invalidSignature.headers['webhook-signature'] = 'v1,invalid';
    await expect(service.handle(invalidSignature.rawBody, invalidSignature.headers))
      .rejects.toMatchObject({ status: 401 });

    const foreign = signedHook(smsPayload('+12025550123'), 'msg_test_2');
    await expect(service.handle(foreign.rawBody, foreign.headers))
      .rejects.toMatchObject({ status: 400 });
    expect(provider.sendOtp).not.toHaveBeenCalled();
  });

  it('rejects an oversized hook payload before signature work or SMS submission', async () => {
    const provider = { sendOtp: vi.fn() };
    const service = hookService(config(), provider as unknown as AliyunSmsProvider);

    await expect(service.handle(Buffer.alloc(64 * 1024 + 1), {}))
      .rejects.toMatchObject({ status: 400 });
    expect(provider.sendOtp).not.toHaveBeenCalled();
  });

  it('requires every production adapter secret when Aliyun is enabled', () => {
    expect(() => loadConfig({
      NODE_ENV: 'production',
      API_RELEASE_ID: 'release-sms-config-test-1',
      DATABASE_URL: 'postgresql://postgres:test@127.0.0.1:5432/postgres',
      SUPABASE_URL: 'http://127.0.0.1:8000',
      SUPABASE_PUBLIC_URL: 'https://cloud.readyoufife.com',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key-that-is-long-enough',
      SUPABASE_SECRET_KEY: 'test-secret-key-that-is-long-enough',
      INVITE_AUTH_SECRET: 'test-invite-auth-secret-that-is-long-enough',
      ACCOUNT_IDENTITY_HASH_SECRET: 'test-account-identity-secret-that-is-long-enough',
      IDENTITY_BENEFIT_DIGEST_SECRET: 'test-identity-benefit-secret-that-is-long-enough',
      AI_TEXT_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: 'test-deepseek-key',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      AI_GRAMMAR_MODEL: 'deepseek-v4-flash',
      AI_POLISH_MODEL: 'deepseek-v4-flash',
      TENCENT_CLOUD_SECRET_ID: 'test-tencent-secret-id',
      TENCENT_CLOUD_SECRET_KEY: 'test-tencent-secret-key',
      TENCENT_ASR_ENDPOINT: 'asr.tencentcloudapi.com',
      AI_ASR_STAGING_BUCKET: 'ai-transcription-inputs',
      SMS_PROVIDER: 'aliyun',
    })).toThrow('invalid_api_configuration:ALIYUN_SMS_ACCESS_KEY_ID');
  });

  it('fails closed when any fixed OTP reaches a production API environment', () => {
    for (const key of [
      'GOTRUE_SMS_TEST_OTP',
      'ICAO_TESTFLIGHT_SMS_TEST_OTP',
      'SUPABASE_SMS_TEST_OTP',
    ]) {
      expect(() => config({ NODE_ENV: 'production', [key]: '+8613800138000=123456' }))
        .toThrow('invalid_api_configuration:FIXED_SMS_OTP');
    }
  });

  it('rejects placeholder, weak, non-canonical, or prefixless hook secrets', () => {
    for (const secret of [
      'replace-with-generated-v1-whsec-secret',
      'v1,whsec_dG9vLXNob3J0LXNlY3JldA==',
      'whsec_YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFh',
      'v1,whsec_icao_sms_hook_placeholder_value_123456',
    ]) {
      expect(() => config({ SUPABASE_SMS_HOOK_SECRET: secret }))
        .toThrow('invalid_api_configuration:SUPABASE_SMS_HOOK_SECRET');
    }
  });

  it('accepts only the official Aliyun China SMS endpoint', () => {
    expect(() => config({ ALIYUN_SMS_ENDPOINT: 'sms.example.com' }))
      .toThrow('invalid_api_configuration:ALIYUN_SMS_ENDPOINT');
    expect(config().sms?.aliyunEndpoint).toBe('dysmsapi.aliyuncs.com');
  });

  it('returns the empty JSON response required by the GoTrue HTTP hook', async () => {
    const hook = { handle: vi.fn().mockResolvedValue(undefined) };
    const controller = new SupabaseSmsHookController(hook as unknown as SupabaseSmsHookService);
    const reply = {
      status: vi.fn(),
      send: vi.fn().mockReturnValue(undefined),
    };
    reply.status.mockReturnValue(reply);

    await controller.sendSms(
      { rawBody: Buffer.from('{}'), headers: {} } as never,
      reply as never,
    );

    expect(hook.handle).toHaveBeenCalledOnce();
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({});
  });
});

describe('Aliyun SMS adapter', () => {
  it('uses the approved sign/template contract and strips +86 from the SDK request', async () => {
    const sendSms = vi.fn().mockResolvedValue({
      body: { bizId: 'biz-1', code: 'OK', message: 'OK', requestId: 'request-1' },
    });
    const result = await submitAliyunOtp({ sendSms }, {
      outId: 'msg_test_1',
      phone: '+8613800138000',
      signName: '云启航科成都',
      templateCode: 'SMS_123456789',
      otp: '123456',
    });
    const request = sendSms.mock.calls[0]?.[0] as {
      outId: string;
      phoneNumbers: string;
      signName: string;
      templateCode: string;
      templateParam: string;
    };
    expect(request).toMatchObject({
      outId: 'msg_test_1',
      phoneNumbers: '13800138000',
      signName: '云启航科成都',
      templateCode: 'SMS_123456789',
      templateParam: '{"code":"123456"}',
    });
    expect(result).toEqual({ bizId: 'biz-1', requestId: 'request-1' });
  });
});
