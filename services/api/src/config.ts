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
  DASHSCOPE_API_KEY: z.string().min(10).optional(),
  DASHSCOPE_BASE_URL: z.string().url().default('https://dashscope.aliyuncs.com/compatible-mode/v1'),
  AI_TEXT_MODEL: z.string().min(1).default('qwen-turbo'),
  AI_ASR_MODEL: z.string().min(1).default('qwen3-asr-flash'),
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
  dashscopeApiKey?: string;
  dashscopeBaseUrl: string;
  aiTextModel: string;
  aiAsrModel: string;
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

  return {
    databaseUrl: parsed.data.DATABASE_URL,
    host: parsed.data.HOST,
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    supabasePublishableKey: parsed.data.SUPABASE_PUBLISHABLE_KEY,
    supabasePublicUrl: parsed.data.SUPABASE_PUBLIC_URL,
    supabaseSecretKey: parsed.data.SUPABASE_SECRET_KEY,
    supabaseUrl: parsed.data.SUPABASE_URL,
    dashscopeApiKey: parsed.data.DASHSCOPE_API_KEY,
    dashscopeBaseUrl: parsed.data.DASHSCOPE_BASE_URL,
    aiTextModel: parsed.data.AI_TEXT_MODEL,
    aiAsrModel: parsed.data.AI_ASR_MODEL,
    corsOrigins: parseCorsOrigins(parsed.data.CORS_ORIGINS),
  };
}
