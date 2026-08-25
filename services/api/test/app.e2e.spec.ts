import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AccountService } from '../src/account/account.service';
import { AccountDeletionService } from '../src/account/account-deletion.service';
import { AccountIdentityService } from '../src/account/account-identity.service';
import { AUTH_VERIFIER, type AuthVerifier, type VerifiedAuthSession } from '../src/auth/auth.types';
import { PhoneAuthService } from '../src/auth/phone-auth.service';
import { RecentAuthService } from '../src/auth/recent-auth.service';
import { SessionSecurityService } from '../src/auth/session-security.service';
import { loadConfig } from '../src/config';
import { DatabaseService } from '../src/database/database.service';
import { CommerceService } from '../src/commerce/commerce.service';
import { EditorialService } from '../src/editorial/editorial.service';
import { HttpErrorFilter } from '../src/http-error.filter';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:test@127.0.0.1:5432/postgres';
process.env.SUPABASE_URL = 'http://127.0.0.1:8000';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key-that-is-long-enough';
process.env.SUPABASE_PUBLIC_URL = 'http://127.0.0.1:8000';
process.env.SUPABASE_SECRET_KEY = 'test-secret-key-that-is-long-enough';
process.env.INVITE_AUTH_SECRET = 'test-invite-auth-secret-that-is-long-enough';
process.env.ACCOUNT_IDENTITY_HASH_SECRET = 'test-account-identity-secret-that-is-long-enough';

const testContentCredentialKeyPair = generateKeyPairSync('ed25519');
const testContentCredentialPrivateKey = testContentCredentialKeyPair.privateKey.export({
  format: 'pem',
  type: 'pkcs8',
}).toString();
const testContentCredentialPublicJwk = testContentCredentialKeyPair.publicKey.export({ format: 'jwk' });
const testContentCredentialPublicKey = Buffer.from(testContentCredentialPublicJwk.x!, 'base64url').toString('base64');
const testContentCredentialConfigOptions = {
  expectedContentCredentialPublicKeyBase64: testContentCredentialPublicKey,
};

function productionConfig(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    API_RELEASE_ID: 'release-config-test-1',
    DATABASE_URL: 'postgresql://postgres:test@127.0.0.1:5432/postgres',
    SUPABASE_URL: 'http://supabase.internal:8000',
    SUPABASE_PUBLIC_URL: 'https://cloud.readyoufife.com',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key-that-is-long-enough',
    SUPABASE_SECRET_KEY: 'test-secret-key-that-is-long-enough',
    INVITE_AUTH_SECRET: 'test-invite-auth-secret-that-is-long-enough',
    ACCOUNT_IDENTITY_HASH_SECRET: 'test-account-identity-secret-that-is-long-enough',
    CONTENT_CREDENTIAL_SIGNING_SECRET: 'test-content-credential-secret-that-is-long-enough',
    CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY: testContentCredentialPrivateKey,
    IDENTITY_BENEFIT_DIGEST_SECRET: 'test-identity-benefit-secret-that-is-long-enough',
    APPLE_SIGN_IN_CLIENT_ID: 'com.feizhuicao.app',
    APPLE_TEAM_ID: 'TEAMID1234',
    APPLE_KEY_ID: 'KEYID1234',
    APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\ntest-only-not-a-real-key-material\\n-----END PRIVATE KEY-----',
    APPLE_CREDENTIAL_ENCRYPTION_KEY: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
    APPLE_IAP_BUNDLE_ID: 'com.readyoufife.ios',
    APPLE_IAP_APP_APPLE_ID: '1234567890',
    APPLE_IAP_ROOT_CERTIFICATES_BASE64: 'dGVzdC1yb290LWNlcnRpZmljYXRl',
    AI_TEXT_PROVIDER: 'deepseek',
    DEEPSEEK_API_KEY: 'test-deepseek-key',
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
    AI_GRAMMAR_MODEL: 'deepseek-v4-flash',
    AI_POLISH_MODEL: 'deepseek-v4-flash',
    TENCENT_CLOUD_SECRET_ID: 'test-tencent-secret-id',
    TENCENT_CLOUD_SECRET_KEY: 'test-tencent-secret-key',
    TENCENT_ASR_ENDPOINT: 'asr.tencentcloudapi.com',
    AI_ASR_STAGING_BUCKET: 'ai-transcription-inputs',
    ...overrides,
  };
}

function loadTestProductionConfig(overrides: NodeJS.ProcessEnv = {}) {
  return loadConfig(productionConfig(overrides), testContentCredentialConfigOptions);
}

class FakeAuthVerifier implements AuthVerifier {
  async verify(token: string): Promise<VerifiedAuthSession> {
    if (!['valid-token', 'apple-token', 'legacy-invite-token', 'legacy-wechat-token'].includes(token)) {
      throw new UnauthorizedException('invalid_access_token');
    }
    return {
      accessToken: token,
      authenticationMethods: [{ method: token === 'apple-token' ? 'oauth' : 'otp', timestamp: Math.floor(Date.now() / 1_000) }],
      authUserId: token === 'apple-token'
        ? '00000000-0000-4000-8000-000000000003'
        : '00000000-0000-4000-8000-000000000001',
      identities: token === 'valid-token'
        ? [{ provider: 'phone', subject: '+8613800138000' }]
        : token === 'apple-token'
          ? [{ provider: 'apple', subject: 'apple-subject' }]
          : token === 'legacy-wechat-token'
            ? [{ provider: 'wechat', subject: 'legacy-wechat-openid' }]
            : [{ provider: 'email', subject: 'legacy@example.com' }],
      issuedAt: 1,
      sessionId: '00000000-0000-4000-8000-000000000002',
      user: token === 'valid-token'
        ? { id: '00000000-0000-4000-8000-000000000001', phone: '+8613800138000' }
        : token === 'apple-token'
          ? { id: '00000000-0000-4000-8000-000000000003', email: 'private@privaterelay.appleid.com' }
          : { id: '00000000-0000-4000-8000-000000000001', email: 'legacy@example.com' },
    };
  }
}

async function testApp({ revoked = false }: { revoked?: boolean } = {}) {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue({ ping: async () => undefined })
    .overrideProvider(AUTH_VERIFIER)
    .useValue(new FakeAuthVerifier())
    .overrideProvider(AccountIdentityService)
    .useValue({
      resolve: async (auth: VerifiedAuthSession) => {
        if (auth.user.phone) return { ...auth.user, authUserId: auth.authUserId, providers: ['phone'] };
        if (auth.identities.some((identity) => identity.provider === 'apple')) {
          return { ...auth.user, authUserId: auth.authUserId, providers: ['apple'] };
        }
        throw new UnauthorizedException('unsupported_auth_identity');
      },
    })
    .overrideProvider(SessionSecurityService)
    .useValue({ assertActive: async () => { if (revoked) throw new UnauthorizedException('session_revoked'); }, revokeAll: async () => undefined })
    .overrideProvider(AccountService)
    .useValue({
      authorizePasswordRecovery: async () => ({
        authorized: true,
        expiresAt: 1_800_003_600_000,
        grantId: '00000000-0000-4000-8000-000000000096',
      }),
      bindPhoneWithOtp: async () => ({
        account: { accountId: '00000000-0000-4000-8000-000000000001', phone: '+8613800138000', phoneBound: true, providers: ['phone', 'apple'] },
        session: { accessToken: 'target-access-token', refreshToken: 'target-refresh-token' },
      }),
      startPhoneBinding: async () => ({ sent: true }),
      updatePassword: async () => ({
        session: { accessToken: 'next-access-token', refreshToken: 'next-refresh-token' },
        updated: true,
      }),
      revokeAll: async () => ({ revoked: true }),
      summary: async (accountId: string, phone?: string) => ({ accountId, phone, phoneBound: Boolean(phone), providers: phone ? ['phone'] : ['apple'] }),
    })
    .overrideProvider(AccountDeletionService)
    .useValue({
      requestDeletion: async () => ({
        identityProviderOutcome: 'not_applicable',
        jobId: '00000000-0000-4000-8000-000000000099',
        status: 'completed',
      }),
      statusByIdempotencyKey: async () => ({
        identityProviderOutcome: 'not_applicable',
        jobId: '00000000-0000-4000-8000-000000000099',
        status: 'completed',
      }),
    })
    .overrideProvider(PhoneAuthService)
    .useValue({
      start: async () => ({ accepted: true }),
      startRecovery: async () => ({ accepted: true }),
      startRecentAuth: async () => ({ accepted: true }),
    })
    .overrideProvider(RecentAuthService)
    .useValue({
      issuePhoneOtpGrant: async () => ({
        expiresAt: 1_800_000_300_000,
        grantId: '00000000-0000-4000-8000-000000000095',
        method: 'phone_otp',
        purpose: 'account_delete',
      }),
      issuePasswordGrant: async () => ({
        expiresAt: 1_800_000_300_000,
        grantId: '00000000-0000-4000-8000-000000000094',
        method: 'password',
        purpose: 'account_delete',
      }),
    })
    .overrideProvider(CommerceService)
    .useValue({
      catalog: () => ({
        priceSource: 'storekit',
        products: [{
          productKey: 'membership_31d_v1',
          storeProductId: 'com.readyoufife.ios.membership.31d.v1',
          displayName: '31天会员',
          durationDays: 31,
          autoRenews: false,
          recommended: true,
        }],
      }),
      currentEntitlement: async () => ({
        production: {
          environment: 'production',
          serverTime: '2026-08-24T00:00:00.000Z',
          membership: { active: false, expiresAt: null },
          aiPoints: { available: 100, nextGrantAt: null },
        },
        sandbox: {
          environment: 'sandbox',
          serverTime: '2026-08-24T00:00:00.000Z',
          membership: { active: false, expiresAt: null },
          aiPoints: { available: 0, nextGrantAt: null },
        },
      }),
      verifyAppleTransaction: async () => ({
        created: true,
        transactionId: 'transaction-1',
        entitlement: {
          environment: 'production',
          serverTime: '2026-08-24T00:00:00.000Z',
          membership: { active: true, expiresAt: '2026-09-24T00:00:00.000Z' },
          aiPoints: { available: 1_100, nextGrantAt: null },
        },
      }),
      processAppleNotification: async () => ({
        duplicate: false,
        environment: 'sandbox',
        notificationUuid: '00000000-0000-4000-8000-000000000001',
        processed: true,
      }),
    })
    .overrideProvider(EditorialService)
    .useValue({
      list: async () => ({
        version: 1,
        checksum: 'a'.repeat(64),
        items: [{
          id: 'editorial-resource-icao5-review-rhythm',
          slug: 'icao5-review-rhythm',
          version: 1,
          channel: 'resource',
          category: 'planning',
          badge: '备考规划',
          title: 'ICAO 5 级备考：如何安排复习节奏与能力提升方向',
          summary: '能力导向的复习节奏。',
          tags: ['ICAO 5'],
          publishedAt: '2026-07-23T00:00:00.000Z',
          cover: {
            publicPath: '/editorial-assets/icao5-review-rhythm/cover.jpg',
            alt: '航空学习桌面',
            width: 800,
            height: 500,
            mimeType: 'image/jpeg',
            checksum: 'b'.repeat(64),
            sizeBytes: 10,
          },
        }],
      }),
      get: async (slug: string) => {
        if (slug !== 'icao5-review-rhythm') throw new NotFoundException('editorial_not_found');
        return {
          version: 1,
          checksum: 'a'.repeat(64),
          article: {
            id: 'editorial-resource-icao5-review-rhythm',
            slug,
            version: 1,
            channel: 'resource',
            category: 'planning',
            badge: '备考规划',
            title: 'ICAO 5 级备考：如何安排复习节奏与能力提升方向',
            summary: '能力导向的复习节奏。',
            tags: ['ICAO 5'],
            publishedAt: '2026-07-23T00:00:00.000Z',
            cover: {
              publicPath: '/editorial-assets/icao5-review-rhythm/cover.jpg',
              alt: '航空学习桌面',
              width: 800,
              height: 500,
              mimeType: 'image/jpeg',
              checksum: 'b'.repeat(64),
              sizeBytes: 10,
            },
            blocks: [{ type: 'paragraph', text: '正文' }],
            sourceLinks: [],
          },
        };
      },
    })
    .compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
  app.useGlobalFilters(new HttpErrorFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('API foundation', () => {
  it('never exposes Ops routes from the ordinary user API process', async () => {
    const keys = [
      'OPS_ENABLED',
      'OPS_SESSION_HASH_SECRET',
      'OPS_TOTP_ENCRYPTION_KEY',
      'OPS_TRUSTED_PROXY_SHARED_SECRET',
    ] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, {
      OPS_ENABLED: '1',
      OPS_SESSION_HASH_SECRET: 'test-ops-session-secret-that-is-long-enough',
      OPS_TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      OPS_TRUSTED_PROXY_SHARED_SECRET: 'test-ops-proxy-secret-that-is-long-enough',
    });
    try {
      const app = await testApp();
      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/auth/login',
        payload: {
          email: 'owner@example.com',
          password: 'not-a-real-password',
          totpCode: '000000',
        },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    } finally {
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });

  it('fails closed when required configuration is missing', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('invalid_api_configuration');
  });

  it('accepts only exact HTTP origins in the CORS allowlist', () => {
    const base = {
      DATABASE_URL: process.env.DATABASE_URL,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_PUBLIC_URL: process.env.SUPABASE_PUBLIC_URL,
      SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
      INVITE_AUTH_SECRET: process.env.INVITE_AUTH_SECRET,
      ACCOUNT_IDENTITY_HASH_SECRET: process.env.ACCOUNT_IDENTITY_HASH_SECRET,
    };
    expect(loadConfig({ ...base, CORS_ORIGINS: 'https://feizhuicao.com,http://localhost:8081' }).corsOrigins).toEqual([
      'https://feizhuicao.com',
      'http://localhost:8081',
    ]);
    expect(() => loadConfig({ ...base, CORS_ORIGINS: 'https://feizhuicao.com/path' })).toThrow('invalid_api_configuration:CORS_ORIGINS');
  });

  it('requires Tencent Cloud credentials to be configured as a pair', () => {
    expect(loadTestProductionConfig().tencentAsrEndpoint).toBe('asr.tencentcloudapi.com');
    expect(() => loadTestProductionConfig({ TENCENT_CLOUD_SECRET_KEY: undefined }))
      .toThrow('invalid_api_configuration:TENCENT_CLOUD_CREDENTIALS');
  });

  it('requires every critical AI provider setting to be explicit in production', () => {
    for (const field of [
      'AI_TEXT_PROVIDER',
      'DEEPSEEK_API_KEY',
      'DEEPSEEK_BASE_URL',
      'AI_GRAMMAR_MODEL',
      'AI_POLISH_MODEL',
      'TENCENT_CLOUD_SECRET_ID',
      'TENCENT_CLOUD_SECRET_KEY',
      'TENCENT_ASR_ENDPOINT',
      'AI_ASR_STAGING_BUCKET',
    ]) {
      const environment = productionConfig();
      delete environment[field];
      expect(() => loadConfig(environment, testContentCredentialConfigOptions)).toThrow('invalid_api_configuration');
    }
  });

  it('rejects a content credential private key that does not match the Native public key', () => {
    expect(() => loadConfig(productionConfig()))
      .toThrow('invalid_api_configuration:CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY');
  });

  it('requires Apple verifier trust roots in production', () => {
    const configured = loadTestProductionConfig();
    expect(configured.appleIapBundleId).toBe('com.readyoufife.ios');
    expect(configured.appleIapAppAppleId).toBe(1_234_567_890);
    expect(configured.appleIapRootCertificates).toHaveLength(1);
    for (const field of [
      'APPLE_IAP_APP_APPLE_ID',
      'APPLE_IAP_ROOT_CERTIFICATES_BASE64',
    ]) {
      const environment = productionConfig();
      delete environment[field];
      expect(() => loadConfig(environment)).toThrow('invalid_api_configuration');
    }
    expect(() => loadTestProductionConfig({
      APPLE_IAP_ROOT_CERTIFICATES_BASE64: 'not valid base64',
    })).toThrow('invalid_api_configuration:APPLE_IAP_ROOT_CERTIFICATES_BASE64');
  });

  it('exposes only DeepSeek text AI and Tencent ASR production configuration', () => {
    const config = loadTestProductionConfig();
    expect(config.aiTextProvider).toBe('deepseek');
    expect(config.deepseekBaseUrl).toBe('https://api.deepseek.com');
    expect(config.tencentAsrEndpoint).toBe('asr.tencentcloudapi.com');
    expect(config).not.toHaveProperty('dashscopeApiKey');
    expect(config).not.toHaveProperty('dashscopeBaseUrl');
    expect(config).not.toHaveProperty('aiTextModel');
    expect(config).not.toHaveProperty('wechat');
  });

  it('rejects unversioned or non-production AI endpoints in production', () => {
    expect(() => loadTestProductionConfig({ API_RELEASE_ID: 'unversioned' }))
      .toThrow('invalid_api_configuration:API_RELEASE_ID');
    expect(() => loadTestProductionConfig({ DEEPSEEK_BASE_URL: 'http://api.deepseek.com' }))
      .toThrow('invalid_api_configuration:DEEPSEEK_BASE_URL');
    expect(() => loadTestProductionConfig({ TENCENT_ASR_ENDPOINT: 'example.com' }))
      .toThrow('invalid_api_configuration:TENCENT_ASR_ENDPOINT');
  });

  it('returns live and ready health envelopes', async () => {
    const app = await testApp();
    const live = await app.inject({ method: 'GET', url: '/health/live' });
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(live.statusCode).toBe(200);
    expect(live.headers['x-icao-api-version']).toBe('development');
    expect(live.json().data).toEqual({ service: 'icao-api', status: 'ok' });
    expect(ready.statusCode).toBe(200);
    expect(ready.headers['x-icao-api-version']).toBe('development');
    expect(ready.json().data).toEqual({ service: 'icao-api', status: 'ok', database: 'ok' });
    await app.close();
  });

  it('does not expose the retired dynamic AI word-lookup route', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/ai/word-lookup',
      headers: { authorization: 'Bearer valid-token' },
      payload: { module: 'opi', questionId: 'q-1', word: 'runway', sentence: 'Cleared to land runway 27.' },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('rejects missing and invalid access tokens with stable codes', async () => {
    const app = await testApp();
    const missing = await app.inject({ method: 'GET', url: '/v1/me' });
    const invalid = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer invalid' } });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.code).toBe('missing_bearer_token');
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json().error.code).toBe('invalid_access_token');
    await app.close();
  });

  it('returns the authenticated user for a valid token', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer valid-token' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      authUserId: '00000000-0000-4000-8000-000000000001',
      id: '00000000-0000-4000-8000-000000000001',
      phone: '+8613800138000',
      providers: ['phone'],
    });
    await app.close();
  });

  it('accepts a verified Apple identity before any phone is bound', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer apple-token' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      authUserId: '00000000-0000-4000-8000-000000000003',
      email: 'private@privaterelay.appleid.com',
      id: '00000000-0000-4000-8000-000000000003',
      providers: ['apple'],
    });
    await app.close();
  });

  it('rejects a valid legacy invite session that has no +86 phone identity', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer legacy-invite-token' } });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('unsupported_auth_identity');
    await app.close();
  });

  it('rejects a valid legacy WeChat token at the authenticated guard boundary', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer legacy-wechat-token' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('unsupported_auth_identity');
    await app.close();
  });

  it('rejects a server-revoked session immediately', async () => {
    const app = await testApp({ revoked: true });
    const response = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer valid-token' } });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('session_revoked');
    await app.close();
  });

  it('supports global session revocation and validated account deletion', async () => {
    const app = await testApp();
    const headers = { authorization: 'Bearer valid-token' };
    const revoked = await app.inject({ method: 'POST', url: '/v1/account/sessions/revoke-all', headers });
    const invalidDeletion = await app.inject({ method: 'DELETE', url: '/v1/account', headers, payload: { confirmation: '删除账号' } });
    const nonV4Deletion = await app.inject({
      method: 'DELETE',
      url: '/v1/account',
      headers,
      payload: {
        confirmation: '注销账号',
        grantId: '00000000-0000-4000-8000-000000000097',
        idempotencyKey: '00000000-0000-1000-8000-000000000098',
      },
    });
    const deleted = await app.inject({
      method: 'DELETE',
      url: '/v1/account',
      headers,
      payload: {
        confirmation: '注销账号',
        grantId: '00000000-0000-4000-8000-000000000097',
        idempotencyKey: '00000000-0000-4000-8000-000000000098',
      },
    });
    const deletionStatus = await app.inject({
      method: 'POST',
      url: '/v1/account/deletion/status',
      payload: { idempotencyKey: '00000000-0000-4000-8000-000000000098' },
    });
    const nonV4DeletionStatus = await app.inject({
      method: 'POST',
      url: '/v1/account/deletion/status',
      payload: { idempotencyKey: '00000000-0000-1000-8000-000000000098' },
    });
    expect(revoked.statusCode).toBe(201);
    expect(revoked.json().data).toEqual({ revoked: true });
    expect(invalidDeletion.statusCode).toBe(400);
    expect(invalidDeletion.json().error.code).toBe('invalid_account_deletion');
    expect(nonV4Deletion.statusCode).toBe(400);
    expect(nonV4Deletion.json().error.code).toBe('invalid_account_deletion');
    expect(deleted.statusCode).toBe(202);
    expect(deleted.json().data).toEqual({
      identityProviderOutcome: 'not_applicable',
      jobId: '00000000-0000-4000-8000-000000000099',
      status: 'completed',
    });
    expect(deletionStatus.statusCode).toBe(201);
    expect(deletionStatus.json().data).toEqual(deleted.json().data);
    expect(nonV4DeletionStatus.statusCode).toBe(400);
    expect(nonV4DeletionStatus.json().error.code).toBe('invalid_account_deletion_status');
    await app.close();
  });

  it('accepts canonical phone binding and keeps legacy routes as bind-only aliases', async () => {
    const app = await testApp();
    const started = await app.inject({
      method: 'POST',
      url: '/v1/account/phone-binding/start',
      headers: { authorization: 'Bearer apple-token' },
      payload: { phone: '+8613800138000' },
    });
    const bound = await app.inject({
      method: 'POST',
      url: '/v1/account/phone-binding/verify',
      headers: { authorization: 'Bearer apple-token' },
      payload: { phone: '+8613800138000', token: '123456' },
    });
    const legacyStarted = await app.inject({
      method: 'POST',
      url: '/v1/account/merge/phone/start',
      headers: { authorization: 'Bearer apple-token' },
      payload: { phone: '+8613800138000' },
    });
    const legacyBound = await app.inject({
      method: 'POST',
      url: '/v1/account/merge/phone',
      headers: { authorization: 'Bearer apple-token' },
      payload: { phone: '+8613800138000', token: '123456' },
    });
    const malformed = await app.inject({
      method: 'POST',
      url: '/v1/account/phone-binding/verify',
      headers: { authorization: 'Bearer apple-token' },
      payload: { phone: '13800138000', token: '1234' },
    });
    const unauthenticated = await app.inject({
      method: 'POST',
      url: '/v1/account/merge/phone',
      payload: { phone: '+8613800138000', token: '123456' },
    });
    expect(started.statusCode).toBe(201);
    expect(started.json().data).toEqual({ sent: true });
    expect(bound.statusCode).toBe(201);
    expect(bound.json().data).toEqual({
      account: {
        accountId: '00000000-0000-4000-8000-000000000001',
        phone: '+8613800138000',
        phoneBound: true,
        providers: ['phone', 'apple'],
      },
      session: { accessToken: 'target-access-token', refreshToken: 'target-refresh-token' },
    });
    expect(legacyStarted.statusCode).toBe(201);
    expect(legacyStarted.json().data).toEqual({ sent: true });
    expect(legacyBound.statusCode).toBe(201);
    expect(legacyBound.json().data).toEqual(bound.json().data);
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('invalid_phone_binding');
    expect(unauthenticated.statusCode).toBe(401);
    await app.close();
  });

  it('exposes neutral server-owned phone OTP starts and a guarded password update', async () => {
    const app = await testApp();
    const started = await app.inject({
      method: 'POST',
      url: '/v1/auth/phone/otp/start',
      payload: { phone: '+8613800138000' },
    });
    const recovery = await app.inject({
      method: 'POST',
      url: '/v1/auth/phone/recovery/start',
      payload: { phone: '+8613800138000' },
    });
    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/auth/phone/otp/start',
      payload: { phone: '13800138000' },
    });
    const password = await app.inject({
      method: 'POST',
      url: '/v1/account/password',
      headers: { authorization: 'Bearer valid-token' },
      payload: { password: 'newpassword10' },
    });
    const authorizedRecovery = await app.inject({
      method: 'POST',
      url: '/v1/account/password/recovery/authorize',
      headers: { authorization: 'Bearer valid-token' },
    });
    const recentPhoneStart = await app.inject({
      method: 'POST',
      url: '/v1/account/recent-auth/phone/start',
      headers: { authorization: 'Bearer valid-token' },
      payload: { purpose: 'account_delete' },
    });
    const recentPhone = await app.inject({
      method: 'POST',
      url: '/v1/account/recent-auth/phone',
      headers: { authorization: 'Bearer valid-token' },
      payload: { purpose: 'account_delete' },
    });
    const unauthenticatedRecovery = await app.inject({
      method: 'POST',
      url: '/v1/account/password/recovery/authorize',
    });
    const unauthenticatedPassword = await app.inject({
      method: 'POST',
      url: '/v1/account/password',
      payload: { password: 'newpassword10' },
    });
    expect(started.statusCode).toBe(201);
    expect(started.json().data).toEqual({ accepted: true });
    expect(recovery.statusCode).toBe(202);
    expect(recovery.json().data).toEqual({ accepted: true });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('invalid_phone_number');
    expect(password.statusCode).toBe(201);
    expect(password.json().data).toEqual({
      session: { accessToken: 'next-access-token', refreshToken: 'next-refresh-token' },
      updated: true,
    });
    expect(authorizedRecovery.statusCode).toBe(201);
    expect(authorizedRecovery.json().data).toEqual({
      authorized: true,
      expiresAt: 1_800_003_600_000,
      grantId: '00000000-0000-4000-8000-000000000096',
    });
    expect(recentPhoneStart.statusCode).toBe(201);
    expect(recentPhoneStart.json().data).toEqual({ accepted: true });
    expect(recentPhone.statusCode).toBe(201);
    expect(recentPhone.json().data).toEqual({
      expiresAt: 1_800_000_300_000,
      grantId: '00000000-0000-4000-8000-000000000095',
      method: 'phone_otp',
      purpose: 'account_delete',
    });
    expect(unauthenticatedRecovery.statusCode).toBe(401);
    expect(unauthenticatedPassword.statusCode).toBe(401);
    await app.close();
  });

  it('does not expose the retired Native invite-code session endpoint', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/invite/session',
      payload: { inviteCode: '起落平安-7K4M-2Q9X' },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('does not register the retired WeChat session endpoint', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/wechat/session',
      payload: {},
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('requires authentication for question banks, vocabulary, resources, editorial, feedback and AI', async () => {
    const app = await testApp();
    const payload = { accepted: true, policyVersion: 'ai-learning-privacy-v1' };
    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/v1/question-banks' }),
      app.inject({ method: 'GET', url: '/v1/vocabulary' }),
      app.inject({ method: 'GET', url: '/v1/resources/resolve?path=/question-bank-assets/test.mp3' }),
      app.inject({ method: 'GET', url: '/v1/editorial?channel=resource' }),
      app.inject({ method: 'POST', url: '/v1/feedback' }),
      app.inject({ method: 'POST', url: '/v1/ai/consent', payload }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([401, 401, 401, 401, 401, 401]);
    expect(responses.map((response) => response.json().error.code)).toEqual([
      'missing_bearer_token', 'missing_bearer_token', 'missing_bearer_token', 'missing_bearer_token', 'missing_bearer_token', 'missing_bearer_token',
    ]);
    await app.close();
  });

  it('protects the commerce surface and keeps Apple environment selection out of request bodies', async () => {
    const app = await testApp();
    const headers = { authorization: 'Bearer valid-token' };
    const missing = await app.inject({ method: 'GET', url: '/v1/commerce/catalog' });
    const catalog = await app.inject({ method: 'GET', url: '/v1/commerce/catalog', headers });
    const entitlement = await app.inject({ method: 'GET', url: '/v1/commerce/entitlements/current', headers });
    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/commerce/apple/transactions/verify',
      headers,
      payload: { signedTransaction: 'not-a-jws', environment: 'production' },
    });
    const verified = await app.inject({
      method: 'POST',
      url: '/v1/commerce/apple/transactions/verify',
      headers,
      payload: { signedTransaction: `${'a'.repeat(100)}.b.c` },
    });
    expect(missing.statusCode).toBe(401);
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().data).toMatchObject({ priceSource: 'storekit' });
    expect(entitlement.json().data).toMatchObject({
      production: { environment: 'production', aiPoints: { available: 100 } },
      sandbox: { environment: 'sandbox', aiPoints: { available: 0 } },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('invalid_apple_transaction_request');
    expect(verified.statusCode).toBe(200);
    expect(verified.json().data).toMatchObject({ created: true, transactionId: 'transaction-1' });
    await app.close();
  });

  it('accepts App Store Server Notifications V2 without an app bearer token', async () => {
    const app = await testApp();
    const signedPayload = `${'a'.repeat(100)}.b.c`;
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/commerce/apple/notifications/v2',
      payload: { signedPayload },
    });
    const malformed = await app.inject({
      method: 'POST',
      url: '/v1/commerce/apple/notifications/v2',
      payload: { signedPayload: 'not-a-jws', environment: 'production' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ accepted: true });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('invalid_apple_notification_request');
    await app.close();
  });

  it('does not register the retired OPI analysis endpoint', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/ai/opi-analysis',
      headers: { authorization: 'Bearer valid-token' },
      payload: { module: 'opi', questionId: 'question', questionText: 'Question', transcript: 'Answer' },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('serves the authenticated vocabulary release with ETag caching', async () => {
    const app = await testApp();
    const headers = { authorization: 'Bearer valid-token' };
    const response = await app.inject({ method: 'GET', url: '/v1/vocabulary', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.dataset.books.map((book: { words: unknown[] }) => book.words.length)).toEqual([360, 372, 106]);
    const etag = response.headers.etag;
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
    const cached = await app.inject({ method: 'GET', url: '/v1/vocabulary', headers: { ...headers, 'if-none-match': etag! } });
    expect(cached.statusCode).toBe(304);
    await app.close();
  });

  it('serves authenticated editorial list and detail with ETag caching', async () => {
    const app = await testApp();
    const headers = { authorization: 'Bearer valid-token' };
    const list = await app.inject({ method: 'GET', url: '/v1/editorial?channel=resource', headers });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.items.map((item: { slug: string }) => item.slug)).toEqual(['icao5-review-rhythm']);
    expect(list.headers.etag).toBe(`"${'a'.repeat(64)}"`);
    const detail = await app.inject({ method: 'GET', url: '/v1/editorial/icao5-review-rhythm', headers });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.article.blocks).toEqual([{ type: 'paragraph', text: '正文' }]);
    const cached = await app.inject({
      method: 'GET',
      url: '/v1/editorial/icao5-review-rhythm',
      headers: { ...headers, 'if-none-match': detail.headers.etag! },
    });
    expect(cached.statusCode).toBe(304);
    const invalidChannel = await app.inject({ method: 'GET', url: '/v1/editorial?channel=unknown', headers });
    const missing = await app.inject({ method: 'GET', url: '/v1/editorial/missing-article', headers });
    expect(invalidChannel.statusCode).toBe(400);
    expect(invalidChannel.json().error.code).toBe('invalid_editorial_channel');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('editorial_not_found');
    await app.close();
  });

  it('protects sync routes and rejects malformed sync input before database access', async () => {
    const app = await testApp();
    const missing = await app.inject({ method: 'GET', url: '/v1/sync/pull?cursor=0' });
    const invalidCursor = await app.inject({
      method: 'GET',
      url: '/v1/sync/pull?cursor=not-a-number',
      headers: { authorization: 'Bearer valid-token' },
    });
    const invalidPush = await app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: { authorization: 'Bearer valid-token' },
      payload: { mutations: [{ kind: 'card_state' }] },
    });
    const mismatchedPull = await app.inject({
      method: 'GET',
      url: '/v1/sync/pull?cursor=0&ownerUserId=00000000-0000-4000-8000-000000000099',
      headers: { authorization: 'Bearer valid-token' },
    });
    const mismatchedPush = await app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: { authorization: 'Bearer valid-token' },
      payload: { ownerUserId: '00000000-0000-4000-8000-000000000099', mutations: [] },
    });
    expect(missing.statusCode).toBe(401);
    expect(invalidCursor.statusCode).toBe(400);
    expect(invalidCursor.json().error.code).toBe('invalid_sync_cursor');
    expect(invalidPush.statusCode).toBe(400);
    expect(invalidPush.json().error.code).toBe('invalid_sync_payload');
    expect(mismatchedPull.statusCode).toBe(409);
    expect(mismatchedPull.json().error.code).toBe('sync_user_mismatch');
    expect(mismatchedPush.statusCode).toBe(409);
    expect(mismatchedPush.json().error.code).toBe('sync_user_mismatch');
    await app.close();
  });
});
