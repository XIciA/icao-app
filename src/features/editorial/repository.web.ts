import type {
  ApiSuccessEnvelope,
  EditorialArticle,
  EditorialDetailResponse,
  EditorialListResponse,
  ResolvedResource,
} from '@icao/contracts';

import { isEdgeOneProductionWeb } from '@/config/web-runtime';
import { loadWebContentRelease, resolveWebContentUrl } from '@/features/web-content/release';
import { clientVisibleSignedResourceUrl } from '@/features/question-bank/platform/remote-resource-service';
import { apiFetch } from '@/platform/api-client';
import Storage from '@/platform/storage';

const CACHE_KEY = 'icao.web.content.v1.editorial';
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const CLOUD_LIST_CACHE_KEY = 'icao.editorial.v1.list.resource';
const cloudDetailCacheKey = (slug: string) => `icao.editorial.v1.detail.${slug}`;
const cloudAssetCacheKey = (path: string) => `icao.editorial.v1.asset.${path}`;

type EditorialRelease = {
  version: number;
  articles: EditorialArticle[];
};

type CachedEditorialRelease = {
  releaseIdentity: string;
  value: EditorialRelease;
};

export type EditorialLoadSource = 'remote' | 'cache';
export type EditorialLoadResult<T> = {
  data: T;
  source: EditorialLoadSource;
  warning?: 'editorial_remote_unavailable';
};

async function cached() {
  const raw = await Storage.getItem(CACHE_KEY);
  if (!raw) return undefined;
  try {
    const cachedValue = JSON.parse(raw) as CachedEditorialRelease | EditorialRelease;
    const value = 'value' in cachedValue ? cachedValue.value : cachedValue;
    if (!Number.isInteger(value.version) || !Array.isArray(value.articles)) return undefined;
    return {
      releaseIdentity: 'value' in cachedValue ? cachedValue.releaseIdentity : undefined,
      value,
    };
  } catch {
    return undefined;
  }
}

type CloudCached<T> = T & { cachedAt: string };

async function readCloudCache<T>(key: string): Promise<CloudCached<T> | undefined> {
  const raw = await Storage.getItem(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as CloudCached<T>;
  } catch {
    return undefined;
  }
}

async function writeCloudCache<T>(key: string, value: T) {
  await Storage.setItem(key, JSON.stringify({ ...value, cachedAt: new Date().toISOString() }));
}

function assertCloudList(value: EditorialListResponse) {
  if (!value || !Number.isInteger(value.version) || !/^[a-f0-9]{64}$/u.test(value.checksum) || !Array.isArray(value.items)) {
    throw new Error('invalid_editorial_list');
  }
  return value;
}

function assertCloudDetail(value: EditorialDetailResponse, slug: string) {
  if (!value || !Number.isInteger(value.version) || !/^[a-f0-9]{64}$/u.test(value.checksum) || value.article?.slug !== slug || !Array.isArray(value.article.blocks)) {
    throw new Error('invalid_editorial_detail');
  }
  return value;
}

async function loadCloudResourceEditorial(): Promise<EditorialLoadResult<EditorialListResponse>> {
  const cachedValue = await readCloudCache<EditorialListResponse>(CLOUD_LIST_CACHE_KEY);
  try {
    const response = await apiFetch('/v1/editorial?channel=resource', {
      headers: cachedValue ? { 'if-none-match': `"${cachedValue.checksum}"` } : undefined,
    });
    if (response.status === 304 && cachedValue) return { data: cachedValue, source: 'cache' };
    if (!response.ok) throw new Error(`editorial_list_http_${response.status}`);
    const body = await response.json() as ApiSuccessEnvelope<EditorialListResponse>;
    const data = assertCloudList(body.data);
    await writeCloudCache(CLOUD_LIST_CACHE_KEY, data);
    return { data, source: 'remote' };
  } catch (error) {
    if (cachedValue) return { data: cachedValue, source: 'cache', warning: 'editorial_remote_unavailable' };
    throw error;
  }
}

async function loadCloudEditorialArticle(slug: string): Promise<EditorialLoadResult<EditorialDetailResponse> | undefined> {
  const cacheKey = cloudDetailCacheKey(slug);
  const cachedValue = await readCloudCache<EditorialDetailResponse>(cacheKey);
  try {
    const response = await apiFetch(`/v1/editorial/${encodeURIComponent(slug)}`, {
      headers: cachedValue ? { 'if-none-match': `"${cachedValue.checksum}"` } : undefined,
    });
    if (response.status === 304 && cachedValue) return { data: cachedValue, source: 'cache' };
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`editorial_detail_http_${response.status}`);
    const body = await response.json() as ApiSuccessEnvelope<EditorialDetailResponse>;
    const data = assertCloudDetail(body.data, slug);
    await writeCloudCache(cacheKey, data);
    return { data, source: 'remote' };
  } catch (error) {
    if (cachedValue) return { data: cachedValue, source: 'cache', warning: 'editorial_remote_unavailable' };
    throw error;
  }
}

async function resolveCloudEditorialCover(article: EditorialArticle | EditorialListResponse['items'][number]) {
  const cacheKey = cloudAssetCacheKey(article.cover.publicPath);
  const cachedValue = await readCloudCache<ResolvedResource>(cacheKey);
  if (cachedValue) {
    const validUntil = Date.parse(cachedValue.cachedAt) + cachedValue.expiresIn * 1_000 - 30_000;
    if (Date.now() < validUntil) return clientVisibleSignedResourceUrl(cachedValue.url);
  }
  const response = await apiFetch(`/v1/resources/resolve?path=${encodeURIComponent(article.cover.publicPath)}`);
  if (!response.ok) throw new Error(`editorial_asset_http_${response.status}`);
  const body = await response.json() as ApiSuccessEnvelope<ResolvedResource>;
  if (body.data.publicPath !== article.cover.publicPath || body.data.checksum !== article.cover.checksum) {
    throw new Error('invalid_editorial_asset');
  }
  await writeCloudCache(cacheKey, body.data);
  return clientVisibleSignedResourceUrl(body.data.url);
}

function releaseIdentity(contentRelease: Awaited<ReturnType<typeof loadWebContentRelease>>) {
  return contentRelease.releaseChecksum ?? contentRelease.releaseId ?? contentRelease.baseUrl;
}

async function fetchEditorialRelease(identity: string) {
  const response = await fetch(await resolveWebContentUrl('/editorial/release.json'), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
  });
  if (!response.ok) throw new Error(`editorial_http_${response.status}`);
  const value = await response.json() as EditorialRelease;
  if (!Number.isInteger(value.version) || !Array.isArray(value.articles)) {
    throw new Error('invalid_editorial_release');
  }
  await Storage.setItem(CACHE_KEY, JSON.stringify({
    releaseIdentity: identity,
    value,
  } satisfies CachedEditorialRelease));
  return value;
}

async function release(): Promise<{ value: EditorialRelease; source: EditorialLoadSource; warning?: 'editorial_remote_unavailable' }> {
  const contentRelease = await loadWebContentRelease();
  const identity = releaseIdentity(contentRelease);
  const local = await cached();
  if (local?.releaseIdentity === identity) {
    void fetchEditorialRelease(identity).catch(() => undefined);
    return { value: local.value, source: 'cache' };
  }
  try {
    return { value: await fetchEditorialRelease(identity), source: 'remote' };
  } catch (error) {
    if (local) {
      return {
        value: local.value,
        source: 'cache',
        warning: 'editorial_remote_unavailable',
      };
    }
    throw error;
  }
}

export async function loadResourceEditorial(): Promise<EditorialLoadResult<EditorialListResponse>> {
  if (isEdgeOneProductionWeb()) return loadCloudResourceEditorial();
  const loaded = await release();
  const contentRelease = await loadWebContentRelease();
  const items = loaded.value.articles
    .filter((article) => article.channel === 'resource')
    .map((article) => {
      const { blocks: _blocks, sourceLinks: _sourceLinks, editorial: _editorial, ...item } = article as EditorialArticle & { editorial?: unknown };
      return item;
    });
  return {
    data: { version: loaded.value.version, checksum: contentRelease.releaseChecksum ?? '0'.repeat(64), items },
    source: loaded.source,
    warning: loaded.warning,
  };
}

export async function loadEditorialArticle(slug: string): Promise<EditorialLoadResult<EditorialDetailResponse> | undefined> {
  if (isEdgeOneProductionWeb()) return loadCloudEditorialArticle(slug);
  const loaded = await release();
  const contentRelease = await loadWebContentRelease();
  const article = loaded.value.articles.find((candidate) => candidate.slug === slug);
  if (!article) return undefined;
  return {
    data: { version: loaded.value.version, checksum: contentRelease.releaseChecksum ?? '0'.repeat(64), article },
    source: loaded.source,
    warning: loaded.warning,
  };
}

export async function resolveEditorialCover(article: EditorialArticle | EditorialListResponse['items'][number]) {
  if (isEdgeOneProductionWeb()) return resolveCloudEditorialCover(article);
  return resolveWebContentUrl(article.cover.publicPath);
}
