import Storage from '@/platform/storage';

import type { WebContentRelease } from './release';

const CACHE_KEY = 'icao.web.content.release-pointer.v1';
const POINTER_TIMEOUT_MILLISECONDS = 8_000;
let pendingRelease: Promise<WebContentRelease> | undefined;

function validRelease(value: unknown): value is WebContentRelease {
  if (!value || typeof value !== 'object') return false;
  const release = value as Partial<WebContentRelease>;
  if (typeof release.baseUrl !== 'string' || !release.baseUrl.startsWith('https://')) return false;
  if (release.releaseId !== undefined && typeof release.releaseId !== 'string') return false;
  if (release.assetShardCount !== undefined && (!Number.isInteger(release.assetShardCount) || release.assetShardCount < 1)) return false;
  if (release.assetShardTemplate !== undefined && (
    typeof release.assetShardTemplate !== 'string'
    || !release.assetShardTemplate.startsWith('https://')
    || !release.assetShardTemplate.includes('{shard}')
  )) return false;
  return release.releaseChecksum === undefined
    || (typeof release.releaseChecksum === 'string' && /^[a-f0-9]{64}$/u.test(release.releaseChecksum));
}

function configuredRelease(): WebContentRelease | undefined {
  const baseUrl = process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_BASE_URL?.replace(/\/$/u, '');
  if (!baseUrl) return undefined;
  return {
    assetShardCount: Number(process.env.EXPO_PUBLIC_ICAO_WEB_ASSET_SHARD_COUNT) || undefined,
    assetShardTemplate: process.env.EXPO_PUBLIC_ICAO_WEB_ASSET_SHARD_TEMPLATE,
    baseUrl,
    releaseChecksum: process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_CHECKSUM,
    releaseId: process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_RELEASE,
  };
}

async function cachedRelease() {
  const raw = await Storage.getItem(CACHE_KEY);
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as unknown;
    return validRelease(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function fetchRelease() {
  const pointerUrl = process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_POINTER_URL;
  const fallback = configuredRelease() ?? await cachedRelease();
  if (!pointerUrl) {
    if (fallback) return fallback;
    throw new Error('web_content_not_configured');
  }
  try {
    const response = await fetch(pointerUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(POINTER_TIMEOUT_MILLISECONDS),
    });
    if (!response.ok) throw new Error(`web_content_pointer_http_${response.status}`);
    const value = await response.json() as unknown;
    if (!validRelease(value)) throw new Error('web_content_pointer_invalid');
    const release = { ...value, baseUrl: value.baseUrl.replace(/\/$/u, '') };
    await Storage.setItem(CACHE_KEY, JSON.stringify(release));
    return release;
  } catch (error) {
    if (fallback) return fallback;
    throw error;
  }
}

export function loadWebContentRelease() {
  pendingRelease ??= fetchRelease().catch((error) => {
    pendingRelease = undefined;
    throw error;
  });
  return pendingRelease;
}

export async function resolveWebContentUrl(path: string) {
  const release = await loadWebContentRelease();
  return `${release.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function shardForPath(path: string, count: number) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % count;
}

function assetUrlForRelease(path: string, release: WebContentRelease) {
  if (!release.assetShardCount || !release.assetShardTemplate) {
    return `${release.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }
  const shard = String(shardForPath(path, release.assetShardCount) + 1).padStart(2, '0');
  const baseUrl = release.assetShardTemplate.replace('{shard}', shard).replace(/\/$/u, '');
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export function resolveConfiguredWebContentAssetUrl(path: string) {
  const release = configuredRelease();
  return release ? assetUrlForRelease(path, release) : undefined;
}

export async function resolveWebContentAssetUrl(path: string) {
  return assetUrlForRelease(path, await loadWebContentRelease());
}
