import Storage from 'expo-sqlite/kv-store';
import type { ApiSuccessEnvelope, VocabularyDataset, VocabularyRelease } from '@icao/contracts';

import { apiFetch, getApiBaseUrl } from '@/platform/api-client';

const CACHE_KEY = 'icao.content.v1.vocabulary';

type CachedVocabularyRelease = VocabularyRelease & { cachedAt: string };

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

async function readCachedRelease() {
  const raw = await Storage.getItem(CACHE_KEY);
  if (!raw) return undefined;
  try {
    const cached = JSON.parse(raw) as CachedVocabularyRelease;
    validateVocabularyDataset(cached.dataset);
    return cached;
  } catch {
    return undefined;
  }
}

export async function loadVocabulary(): Promise<VocabularyLoadResult> {
  const cached = await readCachedRelease();
  if (!getApiBaseUrl()) {
    if (cached) return { dataset: cached.dataset, source: 'cache', warning: 'vocabulary_remote_unavailable' };
    throw new Error('vocabulary_api_unavailable');
  }

  try {
    const response = await apiFetch('/v1/vocabulary', {
      headers: cached ? { 'if-none-match': `"${cached.checksum}"` } : undefined,
    });
    if (response.status === 304 && cached) return { dataset: cached.dataset, source: 'cache' };
    if (!response.ok) throw new Error(`vocabulary_http_${response.status}`);
    const body = await response.json() as ApiSuccessEnvelope<VocabularyRelease>;
    const release = body.data;
    validateVocabularyDataset(release.dataset);
    await Storage.setItem(CACHE_KEY, JSON.stringify({ ...release, cachedAt: new Date().toISOString() } satisfies CachedVocabularyRelease));
    return { dataset: release.dataset, source: 'remote' };
  } catch (error) {
    if (cached) return { dataset: cached.dataset, source: 'cache', warning: 'vocabulary_remote_unavailable' };
    throw error;
  }
}
