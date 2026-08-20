import type { ApiSuccessEnvelope, VocabularyDataset, VocabularyRelease } from '@icao/contracts';

import { isEdgeOneProductionWeb } from '@/config/web-runtime';
import { loadWebContentRelease, resolveWebContentUrl } from '@/features/web-content/release';
import { apiFetch } from '@/platform/api-client';
import Storage from '@/platform/storage';

const CACHE_KEY = 'icao.web.content.v1.vocabulary';
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const CLOUD_CACHE_KEY = 'icao.content.v1.vocabulary';

type CachedVocabulary = {
  releaseIdentity: string;
  dataset: VocabularyDataset;
};

export type VocabularyLoadResult = {
  dataset: VocabularyDataset;
  source: 'remote' | 'cache';
  warning?: 'vocabulary_remote_unavailable';
};

export function validateVocabularyDataset(dataset: VocabularyDataset) {
  const expected: Record<string, number> = { preview: 360, icao4: 372, icao5: 106 };
  if (dataset.schemaVersion !== 1 || dataset.books.length !== 3) throw new Error('invalid_vocabulary_dataset');
  const ids = new Set<string>();
  let total = 0;
  for (const book of dataset.books) {
    if (expected[book.id] !== book.words.length) throw new Error(`invalid_vocabulary_book:${book.id}`);
    for (const word of book.words) {
      if (ids.has(word.id) || word.bookId !== book.id || !word.word || !word.meaning || !word.example || !word.exampleTranslation) {
        throw new Error(`invalid_vocabulary_word:${word.id}`);
      }
      ids.add(word.id);
      total += 1;
    }
  }
  if (total !== 838) throw new Error('invalid_vocabulary_total');
  return dataset;
}

function releaseIdentity(release: Awaited<ReturnType<typeof loadWebContentRelease>>) {
  return release.releaseChecksum ?? release.releaseId ?? release.baseUrl;
}

async function cached() {
  const raw = await Storage.getItem(CACHE_KEY);
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as unknown;
    if (
      value
      && typeof value === 'object'
      && 'dataset' in value
      && 'releaseIdentity' in value
      && typeof value.releaseIdentity === 'string'
    ) {
      return {
        dataset: validateVocabularyDataset(value.dataset as VocabularyDataset),
        releaseIdentity: value.releaseIdentity,
      };
    }
    return {
      dataset: validateVocabularyDataset(value as VocabularyDataset),
      releaseIdentity: undefined,
    };
  } catch {
    return undefined;
  }
}

async function fetchVocabulary(identity: string) {
  const response = await fetch(await resolveWebContentUrl('/vocabulary/dataset.json'), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
  });
  if (!response.ok) throw new Error(`vocabulary_http_${response.status}`);
  const dataset = validateVocabularyDataset(await response.json() as VocabularyDataset);
  await Storage.setItem(CACHE_KEY, JSON.stringify({
    dataset,
    releaseIdentity: identity,
  } satisfies CachedVocabulary));
  return dataset;
}

type CachedCloudRelease = VocabularyRelease & { cachedAt: string };

async function readCloudCache() {
  const raw = await Storage.getItem(CLOUD_CACHE_KEY);
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as CachedCloudRelease;
    validateVocabularyDataset(value.dataset);
    return value;
  } catch {
    return undefined;
  }
}

async function loadCloudVocabulary(): Promise<VocabularyLoadResult> {
  const local = await readCloudCache();
  try {
    const response = await apiFetch('/v1/vocabulary', {
      headers: local ? { 'if-none-match': `"${local.checksum}"` } : undefined,
    });
    if (response.status === 304 && local) return { dataset: local.dataset, source: 'cache' };
    if (!response.ok) throw new Error(`vocabulary_http_${response.status}`);
    const body = await response.json() as ApiSuccessEnvelope<VocabularyRelease>;
    const release = body.data;
    validateVocabularyDataset(release.dataset);
    await Storage.setItem(CLOUD_CACHE_KEY, JSON.stringify({
      ...release,
      cachedAt: new Date().toISOString(),
    } satisfies CachedCloudRelease));
    return { dataset: release.dataset, source: 'remote' };
  } catch (error) {
    if (local) return { dataset: local.dataset, source: 'cache', warning: 'vocabulary_remote_unavailable' };
    throw error;
  }
}

export async function loadVocabulary(): Promise<VocabularyLoadResult> {
  if (isEdgeOneProductionWeb()) return loadCloudVocabulary();
  const release = await loadWebContentRelease();
  const identity = releaseIdentity(release);
  const local = await cached();
  if (local?.releaseIdentity === identity) {
    void fetchVocabulary(identity).catch(() => undefined);
    return { dataset: local.dataset, source: 'cache' };
  }
  try {
    return { dataset: await fetchVocabulary(identity), source: 'remote' };
  } catch (error) {
    if (local) {
      return {
        dataset: local.dataset,
        source: 'cache',
        warning: 'vocabulary_remote_unavailable',
      };
    }
    throw error;
  }
}
