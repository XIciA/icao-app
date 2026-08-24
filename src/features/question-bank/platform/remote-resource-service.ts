import type { ResolvedResource } from '@icao/contracts';

import { apiRequest, getApiBaseUrl } from '@/platform/api-client';
import Storage from '@/platform/storage';

type CachedResource = ResolvedResource & { expiresAt: number };
const RESOURCE_CACHE_PREFIX = 'icao.content.v1.resource.';

function resourceCacheKey(path: string) {
  return `${RESOURCE_CACHE_PREFIX}${encodeURIComponent(path)}`;
}

export function clientVisibleSignedResourceUrl(url: string) {
  const publicSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/u, '');
  if (!publicSupabaseUrl) return url;
  try {
    const signed = new URL(url);
    return `${publicSupabaseUrl}${signed.pathname}${signed.search}${signed.hash}`;
  } catch {
    return url;
  }
}

export async function resolveSignedQuestionBankAsset(
  path: string,
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
) {
  if (!getApiBaseUrl()) return undefined;
  const key = resourceCacheKey(path);
  const cachedValue = await Storage.getItem(key);
  if (cachedValue && !forceRefresh) {
    try {
      const cached = JSON.parse(cachedValue) as CachedResource;
      if (cached.publicPath === path && cached.expiresAt > Date.now() + 30_000) {
        return clientVisibleSignedResourceUrl(cached.url);
      }
    } catch {
      // Ignore invalid cache and fetch a fresh signed URL.
    }
  }
  const resource = await apiRequest<ResolvedResource>(`/v1/resources/resolve?path=${encodeURIComponent(path)}`);
  const visibleResource = { ...resource, url: clientVisibleSignedResourceUrl(resource.url) };
  await Storage.setItem(key, JSON.stringify({
    ...visibleResource,
    expiresAt: Date.now() + resource.expiresIn * 1_000,
  } satisfies CachedResource));
  return visibleResource.url;
}

export async function clearQuestionBankResourceCredentials() {
  const keys = (await Storage.getAllKeys()).filter((key) => key.startsWith(RESOURCE_CACHE_PREFIX));
  if (keys.length > 0) await Storage.multiRemove(keys);
}
