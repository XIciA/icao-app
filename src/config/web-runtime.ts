export type WebRuntime = 'vercel-legacy' | 'edgeone-production';

export const WEB_RUNTIME: WebRuntime = process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME === 'edgeone-production'
  ? 'edgeone-production'
  : 'vercel-legacy';

export function isEdgeOneProductionWeb() {
  return WEB_RUNTIME === 'edgeone-production';
}

export function isVercelLegacyWeb(platform: string, runtime: WebRuntime = WEB_RUNTIME) {
  return platform === 'web' && runtime === 'vercel-legacy';
}

export function isFormalAppSurface(platform: string, runtime: WebRuntime = WEB_RUNTIME) {
  return !isVercelLegacyWeb(platform, runtime);
}
