export type WebContentRelease = {
  assetShardCount?: number;
  assetShardTemplate?: string;
  baseUrl: string;
  releaseChecksum?: string;
  releaseId?: string;
};

export async function loadWebContentRelease(): Promise<WebContentRelease> {
  const baseUrl = process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_BASE_URL?.replace(/\/$/u, '');
  if (!baseUrl) throw new Error('web_content_not_configured');
  return {
    assetShardCount: Number(process.env.EXPO_PUBLIC_ICAO_WEB_ASSET_SHARD_COUNT) || undefined,
    assetShardTemplate: process.env.EXPO_PUBLIC_ICAO_WEB_ASSET_SHARD_TEMPLATE,
    baseUrl,
    releaseChecksum: process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_CHECKSUM,
    releaseId: process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_RELEASE,
  };
}

export async function resolveWebContentUrl(path: string) {
  const release = await loadWebContentRelease();
  return `${release.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function resolveWebContentAssetUrl(path: string) {
  return resolveWebContentUrl(path);
}

export function resolveConfiguredWebContentAssetUrl(path: string) {
  const baseUrl = process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_BASE_URL?.replace(/\/$/u, '');
  return baseUrl ? `${baseUrl}${path.startsWith('/') ? path : `/${path}`}` : undefined;
}
