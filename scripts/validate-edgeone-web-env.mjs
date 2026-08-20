const required = [
  'EXPO_PUBLIC_ICAO_API_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
];

const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  throw new Error(`edgeone_web_env_missing:${missing.join(',')}`);
}

const expectedUrls = {
  EXPO_PUBLIC_ICAO_API_URL: 'https://api.readyoufife.com',
  EXPO_PUBLIC_SUPABASE_URL: 'https://cloud.readyoufife.com',
};

for (const [key, expected] of Object.entries(expectedUrls)) {
  const value = process.env[key]?.replace(/\/$/u, '');
  if (value !== expected) throw new Error(`edgeone_web_env_invalid:${key}`);
}

if (/service_role|secret/iu.test(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '')) {
  throw new Error('edgeone_web_env_forbidden:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
}

console.log('EdgeOne Web public environment is configured.');
