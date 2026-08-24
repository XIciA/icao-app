import { BadGatewayException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountIdentityService } from '../src/account/account-identity.service';
import type { AuthVerifier } from '../src/auth/auth.types';
import type { RecentSocialAuthGrantService } from '../src/auth/recent-social-auth-grant.service';
import { WechatAuthService } from '../src/auth/wechat-auth.service';
import type { ApiConfig } from '../src/config';

const supabase = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabase.createClient,
}));

const config: ApiConfig = {
  apiReleaseId: 'test',
  aiAsrPollIntervalMs: 2_000,
  aiAsrSignedUrlTtlSeconds: 600,
  aiAsrStagingBucket: 'test-audio',
  aiAsrStaleAudioTtlSeconds: 86_400,
  aiAsrTimeoutMs: 55_000,
  aiGrammarModel: 'test-grammar',
  aiPolishModel: 'test-polish',
  aiReviewMaxConcurrency: 50,
  aiTextProvider: 'deepseek',
  corsOrigins: ['http://127.0.0.1:8081'],
  databaseUrl: 'postgresql://postgres:test@127.0.0.1:5432/postgres',
  deepseekBaseUrl: 'https://api.deepseek.com',
  host: '127.0.0.1',
  inviteAuthSecret: 'different-test-invite-auth-secret-at-least-32-bytes',
  accountIdentityHashSecret: 'test-separate-account-identity-secret-at-least-32-bytes',
  nodeEnv: 'test',
  port: 3101,
  supabasePublishableKey: 'test-publishable-key-that-is-long-enough',
  supabasePublicUrl: 'http://127.0.0.1:8000',
  supabaseSecretKey: 'test-secret-key-that-is-long-enough',
  supabaseUrl: 'http://127.0.0.1:8000',
  tencentAsrEndpoint: 'asr.tencentcloudapi.com',
  wechat: {
    apiBaseUrl: 'https://api.weixin.qq.com',
    appId: 'wx1234567890test',
    appSecret: 'test-wechat-app-secret',
  },
};

type BridgeOverrides = {
  generateLink?: ReturnType<typeof vi.fn>;
  signOut?: ReturnType<typeof vi.fn>;
  verifyOtp?: ReturnType<typeof vi.fn>;
};

function createService(overrides: BridgeOverrides = {}) {
  const generateLink = overrides.generateLink ?? vi.fn().mockResolvedValue({
    data: {
      properties: { hashed_token: 'supabase-hashed-token', verification_type: 'magiclink' },
      user: { id: 'auth-user-1' },
    },
    error: null,
  });
  const signOut = overrides.signOut ?? vi.fn().mockResolvedValue({ error: null });
  const verifyOtp = overrides.verifyOtp ?? vi.fn().mockResolvedValue({
    data: {
      session: {
        access_token: 'supabase-access-token',
        expires_at: 1_800_000_000,
        refresh_token: 'supabase-refresh-token',
      },
      user: { id: 'auth-user-1' },
    },
    error: null,
  });
  const adminAuth = { auth: { admin: { generateLink, signOut } } };
  const publicAuth = { auth: { verifyOtp } };
  supabase.createClient
    .mockReturnValueOnce(adminAuth)
    .mockReturnValueOnce(publicAuth);

  const identities = {
    registerWechatIdentity: vi.fn().mockResolvedValue('account-1'),
  };
  const verifier = {
    verify: vi.fn().mockResolvedValue({ authUserId: 'auth-user-1', sessionId: 'wechat-session-1' }),
  };
  const recentSocialAuth = { issue: vi.fn() };
  return {
    generateLink,
    identities,
    service: new WechatAuthService(
      config,
      verifier as unknown as AuthVerifier,
      identities as unknown as AccountIdentityService,
      recentSocialAuth as unknown as RecentSocialAuthGrantService,
    ),
    recentSocialAuth,
    signOut,
    verifyOtp,
  };
}

function response(body: object, ok = true): Response {
  return {
    json: vi.fn().mockResolvedValue(body),
    ok,
  } as unknown as Response;
}

describe('WechatAuthService', () => {
  beforeEach(() => {
    supabase.createClient.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchanges a WeChat code for a Supabase session and never returns upstream secrets', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      access_token: 'wechat-upstream-access-token',
      openid: 'wechat-open-id',
      unionid: 'wechat-union-id',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { generateLink, identities, recentSocialAuth, service, verifyOtp } = createService();

    const result = await service.exchange('one-time-wechat-code');

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.origin).toBe('https://api.weixin.qq.com');
    expect(requestUrl.pathname).toBe('/sns/oauth2/access_token');
    expect(requestUrl.searchParams.get('appid')).toBe(config.wechat?.appId);
    expect(requestUrl.searchParams.get('secret')).toBe(config.wechat?.appSecret);
    expect(requestUrl.searchParams.get('code')).toBe('one-time-wechat-code');
    expect(generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: expect.stringMatching(/^wechat-[a-f0-9]{64}@auth\.readyoufife\.invalid$/u),
      options: { data: { account_provider: 'wechat', age_gate: '16_plus' } },
    });
    const bridgeEmail = generateLink.mock.calls[0]?.[0]?.email as string;
    expect(bridgeEmail).not.toContain('wechat-union-id');
    expect(verifyOtp).toHaveBeenCalledWith({
      type: 'magiclink',
      token_hash: 'supabase-hashed-token',
    });
    expect(identities.registerWechatIdentity).toHaveBeenCalledWith('auth-user-1', 'wechat-union-id');
    expect(recentSocialAuth.issue).toHaveBeenCalledWith('wechat', 'auth-user-1', 'wechat-session-1');
    expect(result).toEqual({
      accessToken: 'supabase-access-token',
      expiresAt: 1_800_000_000,
      refreshToken: 'supabase-refresh-token',
    });
    const publicResponse = JSON.stringify(result);
    expect(publicResponse).not.toContain('wechat-upstream-access-token');
    expect(publicResponse).not.toContain('wechat-open-id');
    expect(publicResponse).not.toContain('wechat-union-id');
    expect(publicResponse).not.toContain(config.wechat!.appSecret);
  });

  it('falls back to the user-info endpoint when the token response omits UnionID', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        access_token: 'wechat-upstream-access-token',
        openid: 'wechat-open-id',
      }))
      .mockResolvedValueOnce(response({
        openid: 'wechat-open-id',
        unionid: 'wechat-union-id-from-profile',
      }));
    vi.stubGlobal('fetch', fetchMock);
    const { identities, service } = createService();

    await service.exchange('one-time-wechat-code');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const profileUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(profileUrl.pathname).toBe('/sns/userinfo');
    expect(profileUrl.searchParams.get('access_token')).toBe('wechat-upstream-access-token');
    expect(profileUrl.searchParams.get('openid')).toBe('wechat-open-id');
    expect(identities.registerWechatIdentity)
      .toHaveBeenCalledWith('auth-user-1', 'wechat-union-id-from-profile');
  });

  it('uses the signup verification type when the first WeChat login creates the bridge user', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      access_token: 'wechat-upstream-access-token',
      openid: 'wechat-open-id',
      unionid: 'wechat-union-id',
    })));
    const generateLink = vi.fn().mockResolvedValue({
      data: {
        properties: { hashed_token: 'first-login-hash', verification_type: 'signup' },
        user: { id: 'auth-user-1' },
      },
      error: null,
    });
    const { service, verifyOtp } = createService({ generateLink });

    await service.exchange('first-wechat-code');

    expect(verifyOtp).toHaveBeenCalledWith({
      type: 'signup',
      token_hash: 'first-login-hash',
    });
  });

  it('fails closed for an invalid WeChat authorization response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      errcode: 40_029,
      errmsg: 'invalid code',
    })));
    const { generateLink, identities, service } = createService();

    await expect(service.exchange('invalid-code'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(generateLink).not.toHaveBeenCalled();
    expect(identities.registerWechatIdentity).not.toHaveBeenCalled();
  });

  it('rejects an identity without UnionID instead of creating an OpenID-scoped account', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response({
        access_token: 'wechat-upstream-access-token',
        openid: 'wechat-open-id',
      }))
      .mockResolvedValueOnce(response({ openid: 'wechat-open-id' })));
    const { generateLink, identities, service } = createService();

    await expect(service.exchange('one-time-wechat-code'))
      .rejects.toSatisfy((error: unknown) => error instanceof ServiceUnavailableException
        && error.message === 'wechat_unionid_unavailable');
    expect(generateLink).not.toHaveBeenCalled();
    expect(identities.registerWechatIdentity).not.toHaveBeenCalled();
  });

  it('rejects a mismatched Supabase bridge user before linking the identity', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      access_token: 'wechat-upstream-access-token',
      openid: 'wechat-open-id',
      unionid: 'wechat-union-id',
    })));
    const verifyOtp = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: 'supabase-access-token',
          refresh_token: 'supabase-refresh-token',
        },
        user: { id: 'different-auth-user' },
      },
      error: null,
    });
    const { identities, service } = createService({ verifyOtp });

    await expect(service.exchange('one-time-wechat-code'))
      .rejects.toSatisfy((error: unknown) => error instanceof ServiceUnavailableException
        && error.message === 'wechat_session_bridge_unavailable');
    expect(identities.registerWechatIdentity).not.toHaveBeenCalled();
  });

  it('revokes the new local session when identity registration fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      access_token: 'wechat-upstream-access-token',
      openid: 'wechat-open-id',
      unionid: 'wechat-union-id',
    })));
    const { identities, service, signOut } = createService();
    identities.registerWechatIdentity.mockRejectedValueOnce(new Error('identity_account_conflict'));

    await expect(service.exchange('one-time-wechat-code'))
      .rejects.toThrow('identity_account_conflict');
    expect(signOut).toHaveBeenCalledWith('supabase-access-token', 'local');
  });

  it('normalizes network and non-2xx failures without exposing upstream details', async () => {
    const { service } = createService();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('socket secret details')));
    await expect(service.exchange('second-one-time-wechat-code'))
      .rejects.toSatisfy((error: unknown) => error instanceof BadGatewayException
        && error.message === 'wechat_auth_upstream_unavailable');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ message: 'provider secret details' }, false)));
    await expect(service.exchange('one-time-wechat-code'))
      .rejects.toSatisfy((error: unknown) => error instanceof BadGatewayException
        && error.message === 'wechat_auth_upstream_unavailable');
  });
});
