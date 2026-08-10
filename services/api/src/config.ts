import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  HOST: z.string().default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3101),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_PUBLIC_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
  SUPABASE_URL: z.string().url(),
  INVITE_AUTH_SECRET: z.string().min(32),
  DASHSCOPE_API_KEY: z.string().min(10).optional(),
  DASHSCOPE_BASE_URL: z.string().url().default('https://dashscope.aliyuncs.com/compatible-mode/v1'),
  AI_TEXT_MODEL: z.string().min(1).default('qwen-turbo'),
  TENCENT_CLOUD_SECRET_ID: z.string().min(10).optional(),
  TENCENT_CLOUD_SECRET_KEY: z.string().min(10).optional(),
  TENCENT_CLOUD_REGION: z.string().min(1).optional(),
  TENCENT_ASR_ENDPOINT: z.string().min(1).default('asr.tencentcloudapi.com'),
  AI_ASR_STAGING_BUCKET: z.string().min(1).default('ai-transcription-inputs'),
  AI_ASR_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(10_000).default(2_000),
  AI_ASR_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(55_000),
  AI_ASR_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(600),
  AI_ASR_STALE_AUDIO_TTL_SECONDS: z.coerce.number().int().min(3_600).max(604_800).default(86_400),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://127.0.0.1:8081,http://localhost:4173,http://127.0.0.1:4173'),
});

export type ApiConfig = {
  databaseUrl: string;
  host: string;
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  supabasePublishableKey: string;
  supabasePublicUrl: string;
  supabaseSecretKey: string;
  supabaseUrl: string;
  inviteAuthSecret: string;
  dashscopeApiKey?: string;
  dashscopeBaseUrl: string;
  aiTextModel: string;
  tencentCloudSecretId?: string;
  tencentCloudSecretKey?: string;
  tencentCloudRegion?: string;
  tencentAsrEndpoint: string;
  aiAsrStagingBucket: string;
  aiAsrPollIntervalMs: number;
  aiAsrTimeoutMs: number;
  aiAsrSignedUrlTtlSeconds: number;
  aiAsrStaleAudioTtlSeconds: number;
  corsOrigins: string[];
};

export const API_CONFIG = Symbol('API_CONFIG');

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

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || 'environment').join(', ');
    throw new Error(`invalid_api_configuration:${fields}`);
  }
  if (Boolean(parsed.data.TENCENT_CLOUD_SECRET_ID) !== Boolean(parsed.data.TENCENT_CLOUD_SECRET_KEY)) {
    throw new Error('invalid_api_configuration:TENCENT_CLOUD_CREDENTIALS');
  }
  if (/^https?:\/\//u.test(parsed.data.TENCENT_ASR_ENDPOINT) || parsed.data.TENCENT_ASR_ENDPOINT.includes('/')) {
    throw new Error('invalid_api_configuration:TENCENT_ASR_ENDPOINT');
  }

  return {
    databaseUrl: parsed.data.DATABASE_URL,
    host: parsed.data.HOST,
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    supabasePublishableKey: parsed.data.SUPABASE_PUBLISHABLE_KEY,
    supabasePublicUrl: parsed.data.SUPABASE_PUBLIC_URL,
    supabaseSecretKey: parsed.data.SUPABASE_SECRET_KEY,
    supabaseUrl: parsed.data.SUPABASE_URL,
    inviteAuthSecret: parsed.data.INVITE_AUTH_SECRET,
    dashscopeApiKey: parsed.data.DASHSCOPE_API_KEY,
    dashscopeBaseUrl: parsed.data.DASHSCOPE_BASE_URL,
    aiTextModel: parsed.data.AI_TEXT_MODEL,
    tencentCloudSecretId: parsed.data.TENCENT_CLOUD_SECRET_ID,
    tencentCloudSecretKey: parsed.data.TENCENT_CLOUD_SECRET_KEY,
    tencentCloudRegion: parsed.data.TENCENT_CLOUD_REGION,
    tencentAsrEndpoint: parsed.data.TENCENT_ASR_ENDPOINT,
    aiAsrStagingBucket: parsed.data.AI_ASR_STAGING_BUCKET,
    aiAsrPollIntervalMs: parsed.data.AI_ASR_POLL_INTERVAL_MS,
    aiAsrTimeoutMs: parsed.data.AI_ASR_TIMEOUT_MS,
    aiAsrSignedUrlTtlSeconds: parsed.data.AI_ASR_SIGNED_URL_TTL_SECONDS,
    aiAsrStaleAudioTtlSeconds: parsed.data.AI_ASR_STALE_AUDIO_TTL_SECONDS,
    corsOrigins: parseCorsOrigins(parsed.data.CORS_ORIGINS),
  };
}
