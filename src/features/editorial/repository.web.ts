import type {
  EditorialArticle,
  EditorialDetailResponse,
  EditorialListResponse,
} from '@icao/contracts';

import { loadWebContentRelease, resolveWebContentUrl } from '@/features/web-content/release';
import Storage from '@/platform/storage';

const CACHE_KEY = 'icao.web.content.v1.editorial';

type EditorialRelease = {
  version: number;
  articles: EditorialArticle[];
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
    const value = JSON.parse(raw) as EditorialRelease;
    return Number.isInteger(value.version) && Array.isArray(value.articles) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function release(): Promise<{ value: EditorialRelease; source: EditorialLoadSource; warning?: 'editorial_remote_unavailable' }> {
  const local = await cached();
  try {
    const response = await fetch(await resolveWebContentUrl('/editorial/release.json'));
    if (!response.ok) throw new Error(`editorial_http_${response.status}`);
    const value = await response.json() as EditorialRelease;
    if (!Number.isInteger(value.version) || !Array.isArray(value.articles)) throw new Error('invalid_editorial_release');
    await Storage.setItem(CACHE_KEY, JSON.stringify(value));
    return { value, source: 'remote' };
  } catch (error) {
    if (local) return { value: local, source: 'cache', warning: 'editorial_remote_unavailable' };
    throw error;
  }
}

export async function loadResourceEditorial(): Promise<EditorialLoadResult<EditorialListResponse>> {
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
  return resolveWebContentUrl(article.cover.publicPath);
}
