import Constants from 'expo-constants';
import Storage from '@/platform/storage';
import type { ResolvedResource } from '@icao/contracts';

import { apiRequest, getApiBaseUrl } from '@/platform/api-client';

const DEV_ASSET_PORT = 3100;

function devAssetBaseUrl() {
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  return host ? `http://${host}:${DEV_ASSET_PORT}` : undefined;
}

export function getQuestionBankAssetBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_ICAO_ASSET_BASE_URL?.replace(/\/$/, '');
  if (configured) return configured;
  if (__DEV__) return devAssetBaseUrl();
  return undefined;
}

export function resolveQuestionBankAsset(path?: string) {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  const base = getQuestionBankAssetBaseUrl();
  if (!base) return undefined;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function probeResource(url: string) {
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok) throw new Error(`resource_http_${response.status}`);
  return true;
}

type CachedResource = ResolvedResource & { expiresAt: number };
const RESOURCE_CACHE_PREFIX = 'icao.content.v1.resource.';

function resourceCacheKey(path: string) {
  return `${RESOURCE_CACHE_PREFIX}${encodeURIComponent(path)}`;
}

export function clientVisibleResourceUrl(url: string) {
  const publicSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!publicSupabaseUrl) return url;
  try {
    const signed = new URL(url);
    return `${publicSupabaseUrl}${signed.pathname}${signed.search}${signed.hash}`;
  } catch {
    return url;
  }
}

export async function resolveRemoteQuestionBankAsset(path: string, { forceRefresh = false }: { forceRefresh?: boolean } = {}) {
  if (!getApiBaseUrl()) return undefined;
  const key = resourceCacheKey(path);
  const cachedValue = await Storage.getItem(key);
  if (cachedValue && !forceRefresh) {
    try {
      const cached = JSON.parse(cachedValue) as CachedResource;
      if (cached.publicPath === path && cached.expiresAt > Date.now() + 30_000) return clientVisibleResourceUrl(cached.url);
    } catch {
      // Ignore invalid cache and fetch a fresh signed URL.
    }
  }
  const resource = await apiRequest<ResolvedResource>(`/v1/resources/resolve?path=${encodeURIComponent(path)}`);
  const visibleResource = { ...resource, url: clientVisibleResourceUrl(resource.url) };
  await Storage.setItem(key, JSON.stringify({ ...visibleResource, expiresAt: Date.now() + resource.expiresIn * 1000 } satisfies CachedResource));
  return visibleResource.url;
}
