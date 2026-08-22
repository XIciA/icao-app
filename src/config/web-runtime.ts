export type WebRuntime = 'vercel-legacy' | 'edgeone-production';

export const WEB_RUNTIME: WebRuntime = process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME === 'edgeone-production'
  ? 'edgeone-production'
  : 'vercel-legacy';

export function isEdgeOneProductionWeb() {
  return WEB_RUNTIME === 'edgeone-production';
}
