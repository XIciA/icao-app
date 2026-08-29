import {
  CONTENT_CREDENTIAL_PUBLIC_KEY_BASE64,
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_RUNTIME_MODEL_ID,
} from '@icao/contracts';
import { createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  HOST: z.string().default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_RELEASE_ID: z.string().regex(/^[A-Za-z0-9._-]+$/u).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3101),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_PUBLIC_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
  SUPABASE_URL: z.string().url(),
  INVITE_AUTH_SECRET: z.string().min(32),
  ACCOUNT_IDENTITY_HASH_SECRET: z.string().min(32),
  CONTENT_CREDENTIAL_SIGNING_SECRET: z.string().min(32).optional(),
  CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY: z.string().min(48).optional(),
  IDENTITY_BENEFIT_DIGEST_SECRET: z.string().min(32).optional(),
  IDENTITY_BENEFIT_DIGEST_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  IDENTITY_BENEFIT_DIGEST_PREVIOUS_KEYS: z.string().default('{}'),
  APPLE_SIGN_IN_CLIENT_ID: z.string().min(3).optional(),
  APPLE_TEAM_ID: z.string().min(3).optional(),
  APPLE_KEY_ID: z.string().min(3).optional(),
  APPLE_PRIVATE_KEY: z.string().min(32).optional(),
  APPLE_CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),
  APPLE_IAP_BUNDLE_ID: z.literal('com.readyoufife.ios').default('com.readyoufife.ios'),
  APPLE_IAP_APP_APPLE_ID: z.coerce.number().int().positive().optional(),
  APPLE_IAP_ROOT_CERTIFICATES_BASE64: z.string().optional(),
  APPLE_IAP_SERVER_ISSUER_ID: z.uuid().optional(),
  APPLE_IAP_SERVER_KEY_ID: z.string().trim().regex(/^[A-Z0-9]{10}$/u).optional(),
  APPLE_IAP_SERVER_PRIVATE_KEY: z.string().min(48).optional(),
  AI_TEXT_PROVIDER: z.literal('deepseek').default('deepseek'),
  DEEPSEEK_API_KEY: z.string().min(10).optional(),
  DEEPSEEK_BASE_URL: z.string().url().default(DEEPSEEK_API_BASE_URL),
  AI_GRAMMAR_MODEL: z.literal(DEEPSEEK_RUNTIME_MODEL_ID).default(DEEPSEEK_RUNTIME_MODEL_ID),
  AI_POLISH_MODEL: z.literal(DEEPSEEK_RUNTIME_MODEL_ID).default(DEEPSEEK_RUNTIME_MODEL_ID),
  AI_REVIEW_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(2_500).default(50),
  TENCENT_CLOUD_SECRET_ID: z.string().min(10).optional(),
  TENCENT_CLOUD_SECRET_KEY: z.string().min(10).optional(),
  TENCENT_CLOUD_REGION: z.string().min(1).optional(),
  TENCENT_ASR_ENDPOINT: z.string().min(1).default('asr.tencentcloudapi.com'),
  AI_ASR_STAGING_BUCKET: z.string().min(1).default('ai-transcription-inputs'),
  AI_ASR_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(10_000).default(2_000),
  AI_ASR_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(55_000),
  AI_ASR_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(600),
  AI_ASR_STALE_AUDIO_TTL_SECONDS: z.coerce.number().int().min(3_600).max(604_800).default(86_400),
  SMS_PROVIDER: z.enum(['disabled', 'aliyun']).default('disabled'),
  SMS_LEGAL_ENTITY_NAME: z.string().min(2).default('云启航科（成都）科技有限公司'),
  ALIYUN_SMS_ACCESS_KEY_ID: z.string().min(8).optional(),
  ALIYUN_SMS_ACCESS_KEY_SECRET: z.string().min(16).optional(),
  ALIYUN_SMS_ENDPOINT: z.literal('dysmsapi.aliyuncs.com').default('dysmsapi.aliyuncs.com'),
  ALIYUN_SMS_SIGN_NAME: z.string().min(2).default('云启航科成都'),
  ALIYUN_SMS_TEMPLATE_CODE: z.string().regex(/^SMS_[A-Za-z0-9]+$/u).optional(),
  SUPABASE_SMS_HOOK_SECRET: z.string().optional(),
  SMS_SEND_DAILY_LIMIT: z.coerce.number().int().min(1).max(100_000).default(200),
  SMS_SEND_MONTHLY_LIMIT: z.coerce.number().int().min(1).max(1_000_000).default(2_000),
  SMS_PHONE_HOURLY_LIMIT: z.coerce.number().int().min(1).max(100).default(5),
  SMS_PHONE_DAILY_LIMIT: z.coerce.number().int().min(1).max(1_000).default(10),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://127.0.0.1:8081,http://localhost:4173,http://127.0.0.1:4173'),
});

const opsRuntimeSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_RELEASE_ID: z.string().regex(/^[A-Za-z0-9._-]+$/u).default('development'),
  ACCOUNT_IDENTITY_HASH_SECRET: z.string().min(32),
  OPS_ENABLED: z.literal('1'),
  OPS_HOST: z.string().default('127.0.0.1'),
  OPS_PORT: z.coerce.number().int().min(1).max(65_535).default(3102),
  OPS_CORS_ORIGINS: z.string().default('http://localhost:4180,http://127.0.0.1:4180'),
  OPS_SESSION_HASH_SECRET: z.string().min(32),
  OPS_TOTP_ENCRYPTION_KEY: z.string(),
  OPS_TRUSTED_PROXY_SHARED_SECRET: z.string().min(32),
});

const PRODUCTION_AI_ENVIRONMENT_KEYS = [
  'AI_TEXT_PROVIDER',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'AI_GRAMMAR_MODEL',
  'AI_POLISH_MODEL',
  'TENCENT_CLOUD_SECRET_ID',
  'TENCENT_CLOUD_SECRET_KEY',
  'TENCENT_ASR_ENDPOINT',
  'AI_ASR_STAGING_BUCKET',
] as const;

export type SmsConfig = {
  provider: 'disabled' | 'aliyun';
  legalEntityName: string;
  aliyunAccessKeyId?: string;
  aliyunAccessKeySecret?: string;
  aliyunEndpoint: string;
  aliyunSignName: string;
  aliyunTemplateCode?: string;
  supabaseHookSecret?: string;
  dailyLimit: number;
  monthlyLimit: number;
  phoneHourlyLimit: number;
  phoneDailyLimit: number;
};

export const DISABLED_SMS_CONFIG: SmsConfig = {
  provider: 'disabled',
  legalEntityName: '云启航科（成都）科技有限公司',
  aliyunEndpoint: 'dysmsapi.aliyuncs.com',
  aliyunSignName: '云启航科成都',
  dailyLimit: 200,
  monthlyLimit: 2_000,
  phoneHourlyLimit: 5,
  phoneDailyLimit: 10,
};

export type ApiConfig = {
  databaseUrl: string;
  host: string;
  nodeEnv: 'development' | 'test' | 'production';
  apiReleaseId: string;
  port: number;
  supabasePublishableKey: string;
  supabasePublicUrl: string;
  supabaseSecretKey: string;
  supabaseUrl: string;
  inviteAuthSecret: string;
  accountIdentityHashSecret: string;
  contentCredentialSigningSecret?: string;
  contentCredentialSigningPrivateKey?: string;
  identityBenefitDigestSecret?: string;
  identityBenefitDigestKeyVersion?: number;
  identityBenefitDigestPreviousKeys?: Array<{ secret: string; version: number }>;
  appleSignInClientId?: string;
  appleTeamId?: string;
  appleKeyId?: string;
  applePrivateKey?: string;
  appleCredentialEncryptionKey?: string;
  appleIapBundleId: 'com.readyoufife.ios';
  appleIapAppAppleId?: number;
  appleIapRootCertificates: Buffer[];
  appleIapServerIssuerId?: string;
  appleIapServerKeyId?: string;
  appleIapServerPrivateKey?: string;
  aiTextProvider: 'deepseek';
  deepseekApiKey?: string;
  deepseekBaseUrl: string;
  aiGrammarModel: typeof DEEPSEEK_RUNTIME_MODEL_ID;
  aiPolishModel: typeof DEEPSEEK_RUNTIME_MODEL_ID;
  aiReviewMaxConcurrency: number;
  tencentCloudSecretId?: string;
  tencentCloudSecretKey?: string;
  tencentCloudRegion?: string;
  tencentAsrEndpoint: string;
  aiAsrStagingBucket: string;
  aiAsrPollIntervalMs: number;
  aiAsrTimeoutMs: number;
  aiAsrSignedUrlTtlSeconds: number;
  aiAsrStaleAudioTtlSeconds: number;
  sms?: SmsConfig;
  corsOrigins: string[];
};

export type OpsApiConfig = {
  databaseUrl: string;
  nodeEnv: 'development' | 'test' | 'production';
  apiReleaseId: string;
  accountIdentityHashSecret: string;
  opsEnabled: true;
  opsHost: string;
  opsPort: number;
  opsCorsOrigins: string[];
  opsSessionHashSecret: string;
  opsTotpEncryptionKey: string;
  opsTrustedProxySharedSecret: string;
};

export const API_CONFIG = Symbol('API_CONFIG');
export const OPS_API_CONFIG = Symbol('OPS_API_CONFIG');

function parseCorsOrigins(value: string): string[] {
  const origins = [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))];
  if (origins.length === 0) throw new Error('invalid_api_configuration:CORS_ORIGINS');

  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('invalid_api_configuration:CORS_ORIGINS');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('invalid_api_configuration:CORS_ORIGINS');
    }
  }
  return origins;
}

function isValidSupabaseSmsHookSecret(value: string) {
  const encoded = /^v1,whsec_([A-Za-z0-9+/=]{32,88})$/u.exec(value)?.[1];
  if (!encoded) return false;
  const decoded = Buffer.from(encoded, 'base64');
  return decoded.byteLength >= 24
    && decoded.byteLength <= 64
    && decoded.toString('base64') === encoded;
}

function invalidConfiguration(...fields: string[]): never {
  throw new Error(`invalid_api_configuration:${fields.join(', ')}`);
}

function parsePreviousIdentityHashKeys(value: string, currentVersion: number) {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    invalidConfiguration('IDENTITY_BENEFIT_DIGEST_PREVIOUS_KEYS');
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    invalidConfiguration('IDENTITY_BENEFIT_DIGEST_PREVIOUS_KEYS');
  }
  const entries = Object.entries(candidate as Record<string, unknown>).map(([rawVersion, secret]) => ({
    secret,
    version: Number(rawVersion),
  }));
  if (entries.some(({ secret, version }) => (
    !Number.isSafeInteger(version)
    || version < 1
    || version === currentVersion
    || typeof secret !== 'string'
    || secret.length < 32
  ))) invalidConfiguration('IDENTITY_BENEFIT_DIGEST_PREVIOUS_KEYS');
  if (new Set(entries.map(({ version }) => version)).size !== entries.length) {
    invalidConfiguration('IDENTITY_BENEFIT_DIGEST_PREVIOUS_KEYS');
  }
  return entries as Array<{ secret: string; version: number }>;
}

function validateAppleRuntime(data: z.infer<typeof schema>) {
  const fields = [
    'APPLE_SIGN_IN_CLIENT_ID',
    'APPLE_TEAM_ID',
    'APPLE_KEY_ID',
    'APPLE_PRIVATE_KEY',
    'APPLE_CREDENTIAL_ENCRYPTION_KEY',
  ] as const;
  const missing = fields.filter((field) => !data[field]?.trim());
  if (missing.length > 0) invalidConfiguration(...missing);
  const encryptionKey = Buffer.from(data.APPLE_CREDENTIAL_ENCRYPTION_KEY!, 'base64');
  if (
    encryptionKey.byteLength !== 32
    || encryptionKey.toString('base64') !== data.APPLE_CREDENTIAL_ENCRYPTION_KEY
  ) invalidConfiguration('APPLE_CREDENTIAL_ENCRYPTION_KEY');
  try {
    if (!data.APPLE_PRIVATE_KEY!.replaceAll('\\n', '\n').includes('BEGIN PRIVATE KEY')) {
      invalidConfiguration('APPLE_PRIVATE_KEY');
    }
  } catch {
    invalidConfiguration('APPLE_PRIVATE_KEY');
  }
  if (!data.APPLE_IAP_APP_APPLE_ID) invalidConfiguration('APPLE_IAP_APP_APPLE_ID');
  if (!data.APPLE_IAP_ROOT_CERTIFICATES_BASE64?.trim()) {
    invalidConfiguration('APPLE_IAP_ROOT_CERTIFICATES_BASE64');
  }
  validateAppleIapServerCredentials(data, true);
}

function validateAppleIapServerCredentials(
  data: z.infer<typeof schema>,
  required: boolean,
) {
  const fields = [
    'APPLE_IAP_SERVER_ISSUER_ID',
    'APPLE_IAP_SERVER_KEY_ID',
    'APPLE_IAP_SERVER_PRIVATE_KEY',
  ] as const;
  const configured = fields.filter((field) => Boolean(data[field]?.trim()));
  if (configured.length === 0 && !required) return;
  const missing = fields.filter((field) => !data[field]?.trim());
  if (missing.length > 0) invalidConfiguration(...missing);

  const privateKey = data.APPLE_IAP_SERVER_PRIVATE_KEY!.replaceAll('\\n', '\n');
  try {
    const privateJwk = createPrivateKey(privateKey).export({ format: 'jwk' });
    if (privateJwk.kty !== 'EC' || privateJwk.crv !== 'P-256' || !privateJwk.d) {
      invalidConfiguration('APPLE_IAP_SERVER_PRIVATE_KEY');
    }
  } catch {
    invalidConfiguration('APPLE_IAP_SERVER_PRIVATE_KEY');
  }
  if (
    data.APPLE_IAP_SERVER_KEY_ID === data.APPLE_KEY_ID
    || privateKey === data.APPLE_PRIVATE_KEY?.replaceAll('\\n', '\n')
  ) invalidConfiguration('APPLE_IAP_SERVER_CREDENTIAL_REUSE');
}

function parseAppleRootCertificates(value: string | undefined) {
  if (!value?.trim()) return [];
  const encodedCertificates = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (encodedCertificates.length === 0) invalidConfiguration('APPLE_IAP_ROOT_CERTIFICATES_BASE64');
  const certificates = encodedCertificates.map((encoded) => {
    const certificate = Buffer.from(encoded, 'base64');
    if (certificate.length === 0 || certificate.toString('base64') !== encoded) {
      invalidConfiguration('APPLE_IAP_ROOT_CERTIFICATES_BASE64');
    }
    return certificate;
  });
  return certificates;
}

function requireProductionHttpsUrl(name: string, value: string) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
  ) invalidConfiguration(name);
}

function validateProductionAiRuntime(
  environment: NodeJS.ProcessEnv,
  data: z.infer<typeof schema>,
) {
  const missing = PRODUCTION_AI_ENVIRONMENT_KEYS.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) invalidConfiguration(...missing);
  if (['development', 'test', 'unversioned'].includes(data.API_RELEASE_ID.toLowerCase())) {
    invalidConfiguration('API_RELEASE_ID');
  }
  requireProductionHttpsUrl('DEEPSEEK_BASE_URL', data.DEEPSEEK_BASE_URL);
  requireProductionHttpsUrl('SUPABASE_PUBLIC_URL', data.SUPABASE_PUBLIC_URL);
  if (data.DEEPSEEK_BASE_URL !== DEEPSEEK_API_BASE_URL) {
    invalidConfiguration('DEEPSEEK_BASE_URL');
  }
  if (data.DEEPSEEK_BASE_URL.endsWith('/')) invalidConfiguration('DEEPSEEK_BASE_URL');
  if (data.TENCENT_ASR_ENDPOINT !== 'asr.tencentcloudapi.com') {
    invalidConfiguration('TENCENT_ASR_ENDPOINT');
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,62}$/u.test(data.AI_ASR_STAGING_BUCKET)) {
    invalidConfiguration('AI_ASR_STAGING_BUCKET');
  }
}

function validateContentCredentialSigningKey(privateKey: string, expectedPublicKeyBase64: string) {
  try {
    const publicJwk = createPublicKey(createPrivateKey(privateKey)).export({ format: 'jwk' });
    const derivedPublicKey = publicJwk.kty === 'OKP' && publicJwk.crv === 'Ed25519' && publicJwk.x
      ? Buffer.from(publicJwk.x, 'base64url')
      : Buffer.alloc(0);
    const expectedPublicKey = Buffer.from(expectedPublicKeyBase64, 'base64');
    if (
      derivedPublicKey.length !== 32
      || expectedPublicKey.length !== 32
      || !timingSafeEqual(derivedPublicKey, expectedPublicKey)
    ) invalidConfiguration('CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY');
  } catch {
    invalidConfiguration('CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY');
  }
}

type LoadConfigOptions = {
  expectedContentCredentialPublicKeyBase64?: string;
};

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
  options: LoadConfigOptions = {},
): ApiConfig {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || 'environment').join(', ');
    throw new Error(`invalid_api_configuration:${fields}`);
  }
  if (Boolean(parsed.data.TENCENT_CLOUD_SECRET_ID) !== Boolean(parsed.data.TENCENT_CLOUD_SECRET_KEY)) {
    throw new Error('invalid_api_configuration:TENCENT_CLOUD_CREDENTIALS');
  }
  const previousIdentityHashKeys = parsePreviousIdentityHashKeys(
    parsed.data.IDENTITY_BENEFIT_DIGEST_PREVIOUS_KEYS,
    parsed.data.IDENTITY_BENEFIT_DIGEST_KEY_VERSION,
  );
  const appleIapRootCertificates = parseAppleRootCertificates(
    parsed.data.APPLE_IAP_ROOT_CERTIFICATES_BASE64,
  );
  validateAppleIapServerCredentials(parsed.data, false);
  if (parsed.data.NODE_ENV === 'production') {
    const fixedOtpKeys = [
      'GOTRUE_SMS_TEST_OTP',
      'ICAO_TESTFLIGHT_SMS_TEST_OTP',
      'SUPABASE_SMS_TEST_OTP',
    ];
    if (fixedOtpKeys.some((key) => environment[key]?.trim())) {
      invalidConfiguration('FIXED_SMS_OTP');
    }
    validateProductionAiRuntime(environment, parsed.data);
    if (!parsed.data.IDENTITY_BENEFIT_DIGEST_SECRET) invalidConfiguration('IDENTITY_BENEFIT_DIGEST_SECRET');
    if (!parsed.data.CONTENT_CREDENTIAL_SIGNING_SECRET) invalidConfiguration('CONTENT_CREDENTIAL_SIGNING_SECRET');
    if (!parsed.data.CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY) invalidConfiguration('CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY');
  }
  if (/^https?:\/\//u.test(parsed.data.TENCENT_ASR_ENDPOINT) || parsed.data.TENCENT_ASR_ENDPOINT.includes('/')) {
    throw new Error('invalid_api_configuration:TENCENT_ASR_ENDPOINT');
  }
  if (Array.from(parsed.data.ALIYUN_SMS_SIGN_NAME).length > 12) {
    throw new Error('invalid_api_configuration:ALIYUN_SMS_SIGN_NAME');
  }
  if (parsed.data.SMS_SEND_MONTHLY_LIMIT < parsed.data.SMS_SEND_DAILY_LIMIT) {
    throw new Error('invalid_api_configuration:SMS_SEND_MONTHLY_LIMIT');
  }
  if (parsed.data.SMS_PHONE_DAILY_LIMIT < parsed.data.SMS_PHONE_HOURLY_LIMIT) {
    throw new Error('invalid_api_configuration:SMS_PHONE_DAILY_LIMIT');
  }
  if (parsed.data.SMS_PROVIDER === 'aliyun') {
    const required = [
      ['ALIYUN_SMS_ACCESS_KEY_ID', parsed.data.ALIYUN_SMS_ACCESS_KEY_ID],
      ['ALIYUN_SMS_ACCESS_KEY_SECRET', parsed.data.ALIYUN_SMS_ACCESS_KEY_SECRET],
      ['ALIYUN_SMS_TEMPLATE_CODE', parsed.data.ALIYUN_SMS_TEMPLATE_CODE],
      ['SUPABASE_SMS_HOOK_SECRET', parsed.data.SUPABASE_SMS_HOOK_SECRET],
    ] as const;
    const missing = required.filter(([, value]) => !value).map(([name]) => name);
    if (missing.length > 0) throw new Error(`invalid_api_configuration:${missing.join(', ')}`);
    if (!isValidSupabaseSmsHookSecret(parsed.data.SUPABASE_SMS_HOOK_SECRET!)) {
      throw new Error('invalid_api_configuration:SUPABASE_SMS_HOOK_SECRET');
    }
  }
  if (parsed.data.NODE_ENV === 'production') {
    validateAppleRuntime(parsed.data);
    validateContentCredentialSigningKey(
      parsed.data.CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY!.replaceAll('\\n', '\n'),
      options.expectedContentCredentialPublicKeyBase64 ?? CONTENT_CREDENTIAL_PUBLIC_KEY_BASE64,
    );
  }

  return {
    databaseUrl: parsed.data.DATABASE_URL,
    host: parsed.data.HOST,
    nodeEnv: parsed.data.NODE_ENV,
    apiReleaseId: parsed.data.API_RELEASE_ID,
    port: parsed.data.PORT,
    supabasePublishableKey: parsed.data.SUPABASE_PUBLISHABLE_KEY,
    supabasePublicUrl: parsed.data.SUPABASE_PUBLIC_URL,
    supabaseSecretKey: parsed.data.SUPABASE_SECRET_KEY,
    supabaseUrl: parsed.data.SUPABASE_URL,
    inviteAuthSecret: parsed.data.INVITE_AUTH_SECRET,
    accountIdentityHashSecret: parsed.data.ACCOUNT_IDENTITY_HASH_SECRET,
    contentCredentialSigningSecret: parsed.data.CONTENT_CREDENTIAL_SIGNING_SECRET,
    contentCredentialSigningPrivateKey: parsed.data.CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY?.replaceAll('\\n', '\n'),
    identityBenefitDigestSecret: parsed.data.IDENTITY_BENEFIT_DIGEST_SECRET,
    identityBenefitDigestKeyVersion: parsed.data.IDENTITY_BENEFIT_DIGEST_KEY_VERSION,
    identityBenefitDigestPreviousKeys: previousIdentityHashKeys,
    appleSignInClientId: parsed.data.APPLE_SIGN_IN_CLIENT_ID,
    appleTeamId: parsed.data.APPLE_TEAM_ID,
    appleKeyId: parsed.data.APPLE_KEY_ID,
    applePrivateKey: parsed.data.APPLE_PRIVATE_KEY?.replaceAll('\\n', '\n'),
    appleCredentialEncryptionKey: parsed.data.APPLE_CREDENTIAL_ENCRYPTION_KEY,
    appleIapBundleId: parsed.data.APPLE_IAP_BUNDLE_ID,
    appleIapAppAppleId: parsed.data.APPLE_IAP_APP_APPLE_ID,
    appleIapRootCertificates,
    appleIapServerIssuerId: parsed.data.APPLE_IAP_SERVER_ISSUER_ID,
    appleIapServerKeyId: parsed.data.APPLE_IAP_SERVER_KEY_ID,
    appleIapServerPrivateKey: parsed.data.APPLE_IAP_SERVER_PRIVATE_KEY?.replaceAll('\\n', '\n'),
    aiTextProvider: parsed.data.AI_TEXT_PROVIDER,
    deepseekApiKey: parsed.data.DEEPSEEK_API_KEY,
    deepseekBaseUrl: parsed.data.DEEPSEEK_BASE_URL,
    aiGrammarModel: parsed.data.AI_GRAMMAR_MODEL,
    aiPolishModel: parsed.data.AI_POLISH_MODEL,
    aiReviewMaxConcurrency: parsed.data.AI_REVIEW_MAX_CONCURRENCY,
    tencentCloudSecretId: parsed.data.TENCENT_CLOUD_SECRET_ID,
    tencentCloudSecretKey: parsed.data.TENCENT_CLOUD_SECRET_KEY,
    tencentCloudRegion: parsed.data.TENCENT_CLOUD_REGION,
    tencentAsrEndpoint: parsed.data.TENCENT_ASR_ENDPOINT,
    aiAsrStagingBucket: parsed.data.AI_ASR_STAGING_BUCKET,
    aiAsrPollIntervalMs: parsed.data.AI_ASR_POLL_INTERVAL_MS,
    aiAsrTimeoutMs: parsed.data.AI_ASR_TIMEOUT_MS,
    aiAsrSignedUrlTtlSeconds: parsed.data.AI_ASR_SIGNED_URL_TTL_SECONDS,
    aiAsrStaleAudioTtlSeconds: parsed.data.AI_ASR_STALE_AUDIO_TTL_SECONDS,
    sms: {
      provider: parsed.data.SMS_PROVIDER,
      legalEntityName: parsed.data.SMS_LEGAL_ENTITY_NAME,
      aliyunAccessKeyId: parsed.data.ALIYUN_SMS_ACCESS_KEY_ID,
      aliyunAccessKeySecret: parsed.data.ALIYUN_SMS_ACCESS_KEY_SECRET,
      aliyunEndpoint: parsed.data.ALIYUN_SMS_ENDPOINT,
      aliyunSignName: parsed.data.ALIYUN_SMS_SIGN_NAME,
      aliyunTemplateCode: parsed.data.ALIYUN_SMS_TEMPLATE_CODE,
      supabaseHookSecret: parsed.data.SUPABASE_SMS_HOOK_SECRET,
      dailyLimit: parsed.data.SMS_SEND_DAILY_LIMIT,
      monthlyLimit: parsed.data.SMS_SEND_MONTHLY_LIMIT,
      phoneHourlyLimit: parsed.data.SMS_PHONE_HOURLY_LIMIT,
      phoneDailyLimit: parsed.data.SMS_PHONE_DAILY_LIMIT,
    },
    corsOrigins: parseCorsOrigins(parsed.data.CORS_ORIGINS),
  };
}

/**
 * Ops runtime configuration is parsed only by the dedicated Ops process.
 * Invalid or partial Ops variables therefore cannot prevent the ordinary user
 * API from starting.
 */
export function loadOpsConfig(
  environment: NodeJS.ProcessEnv = process.env,
): OpsApiConfig {
  const parsed = opsRuntimeSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => issue.path.join('.') || 'environment')
      .join(', ');
    throw new Error(`invalid_ops_api_configuration:${fields}`);
  }
  const opsEncryptionKey = Buffer.from(parsed.data.OPS_TOTP_ENCRYPTION_KEY, 'base64');
  if (
    opsEncryptionKey.byteLength !== 32
    || opsEncryptionKey.toString('base64') !== parsed.data.OPS_TOTP_ENCRYPTION_KEY
  ) throw new Error('invalid_ops_api_configuration:OPS_TOTP_ENCRYPTION_KEY');
  const opsCorsOrigins = parseCorsOrigins(parsed.data.OPS_CORS_ORIGINS);
  if (parsed.data.NODE_ENV === 'production') {
    if (['development', 'test', 'unversioned'].includes(parsed.data.API_RELEASE_ID.toLowerCase())) {
      throw new Error('invalid_ops_api_configuration:API_RELEASE_ID');
    }
    if (
      opsCorsOrigins.length !== 1
      || opsCorsOrigins[0] !== 'https://ops.readyoufife.com'
    ) throw new Error('invalid_ops_api_configuration:OPS_CORS_ORIGINS');
  }
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    nodeEnv: parsed.data.NODE_ENV,
    apiReleaseId: parsed.data.API_RELEASE_ID,
    accountIdentityHashSecret: parsed.data.ACCOUNT_IDENTITY_HASH_SECRET,
    opsEnabled: true,
    opsHost: parsed.data.OPS_HOST,
    opsPort: parsed.data.OPS_PORT,
    opsCorsOrigins,
    opsSessionHashSecret: parsed.data.OPS_SESSION_HASH_SECRET,
    opsTotpEncryptionKey: parsed.data.OPS_TOTP_ENCRYPTION_KEY,
    opsTrustedProxySharedSecret: parsed.data.OPS_TRUSTED_PROXY_SHARED_SECRET,
  };
}
