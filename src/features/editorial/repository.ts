import type {
  ApiSuccessEnvelope,
  EditorialArticle,
  EditorialDetailResponse,
  EditorialListResponse,
  ResolvedResource,
} from '@icao/contracts';

import { apiFetch, getApiBaseUrl } from '@/platform/api-client';
import Storage from '@/platform/storage';

const LIST_CACHE_KEY = 'icao.editorial.v1.list.resource';
const detailCacheKey = (slug: string) => `icao.editorial.v1.detail.${slug}`;
const assetCacheKey = (path: string) => `icao.editorial.v1.asset.${path}`;

type Cached<T> = T & { cachedAt: string };
export type EditorialLoadSource = 'remote' | 'cache';
export type EditorialLoadResult<T> = {
  data: T;
  source: EditorialLoadSource;
  warning?: 'editorial_remote_unavailable';
};

function previewBaseUrl() {
  return process.env.EXPO_PUBLIC_ICAO_EDITORIAL_PREVIEW_URL?.replace(/\/$/, '');
}

function editorialBaseUrl() {
  return previewBaseUrl() ?? getApiBaseUrl();
}

async function fetchEditorial(path: string, init: RequestInit = {}) {
  const preview = previewBaseUrl();
  if (!preview) return apiFetch(path, init);
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  return fetch(`${preview}${path}`, { ...init, headers });
}

async function readCache<T>(key: string): Promise<Cached<T> | undefined> {
  const raw = await Storage.getItem(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Cached<T>;
  } catch {
    return undefined;
  }
}

async function writeCache<T>(key: string, value: T) {
  await Storage.setItem(key, JSON.stringify({ ...value, cachedAt: new Date().toISOString() }));
}

function assertList(value: EditorialListResponse) {
  if (!value || !Number.isInteger(value.version) || !/^[a-f0-9]{64}$/.test(value.checksum) || !Array.isArray(value.items)) {
    throw new Error('invalid_editorial_list');
  }
  return value;
}

function assertDetail(value: EditorialDetailResponse, slug: string) {
  if (!value || !Number.isInteger(value.version) || !/^[a-f0-9]{64}$/.test(value.checksum) || value.article?.slug !== slug || !Array.isArray(value.article.blocks)) {
    throw new Error('invalid_editorial_detail');
  }
  return value;
}

export async function loadResourceEditorial(): Promise<EditorialLoadResult<EditorialListResponse>> {
  const cached = await readCache<EditorialListResponse>(LIST_CACHE_KEY);
  const baseUrl = editorialBaseUrl();
  if (!baseUrl) {
    if (cached) return { data: cached, source: 'cache', warning: 'editorial_remote_unavailable' };
    throw new Error('editorial_api_not_configured');
  }
  try {
    const headers = cached ? { 'if-none-match': `"${cached.checksum}"` } : undefined;
    const response = await fetchEditorial('/v1/editorial?channel=resource', { headers });
    if (response.status === 304 && cached) return { data: cached, source: 'cache' };
    if (!response.ok) throw new Error(`editorial_list_http_${response.status}`);
    const body = await response.json() as ApiSuccessEnvelope<EditorialListResponse>;
    const data = assertList(body.data);
    await writeCache(LIST_CACHE_KEY, data);
    return { data, source: 'remote' };
  } catch (error) {
    if (cached) return { data: cached, source: 'cache', warning: 'editorial_remote_unavailable' };
    throw error;
  }
}

export async function loadEditorialArticle(slug: string): Promise<EditorialLoadResult<EditorialDetailResponse> | undefined> {
  const cacheKey = detailCacheKey(slug);
  const cached = await readCache<EditorialDetailResponse>(cacheKey);
  const baseUrl = editorialBaseUrl();
  if (!baseUrl) {
    if (cached) return { data: cached, source: 'cache', warning: 'editorial_remote_unavailable' };
    throw new Error('editorial_api_not_configured');
  }
  try {
    const headers = cached ? { 'if-none-match': `"${cached.checksum}"` } : undefined;
    const response = await fetchEditorial(`/v1/editorial/${encodeURIComponent(slug)}`, { headers });
    if (response.status === 304 && cached) return { data: cached, source: 'cache' };
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`editorial_detail_http_${response.status}`);
    const body = await response.json() as ApiSuccessEnvelope<EditorialDetailResponse>;
    const data = assertDetail(body.data, slug);
    await writeCache(cacheKey, data);
    return { data, source: 'remote' };
  } catch (error) {
    if (cached) return { data: cached, source: 'cache', warning: 'editorial_remote_unavailable' };
    throw error;
  }
}

type CachedAsset = ResolvedResource & { cachedAt: string };

export async function resolveEditorialCover(article: EditorialArticle | EditorialListResponse['items'][number]) {
  const preview = previewBaseUrl();
  if (preview) return `${preview}${article.cover.publicPath}`;
  const cached = await readCache<CachedAsset>(assetCacheKey(article.cover.publicPath));
  if (cached) {
    const validUntil = Date.parse(cached.cachedAt) + cached.expiresIn * 1000 - 30_000;
    if (Date.now() < validUntil) return cached.url;
  }
  const response = await apiFetch(`/v1/resources/resolve?path=${encodeURIComponent(article.cover.publicPath)}`);
  if (!response.ok) throw new Error(`editorial_asset_http_${response.status}`);
  const body = await response.json() as ApiSuccessEnvelope<ResolvedResource>;
  if (body.data.publicPath !== article.cover.publicPath || body.data.checksum !== article.cover.checksum) {
    throw new Error('invalid_editorial_asset');
  }
  await writeCache(assetCacheKey(article.cover.publicPath), body.data);
  return body.data.url;
}
