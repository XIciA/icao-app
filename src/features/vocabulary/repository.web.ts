import type { VocabularyDataset } from '@icao/contracts';

import { resolveWebContentUrl } from '@/features/web-content/release';
import Storage from '@/platform/storage';

const CACHE_KEY = 'icao.web.content.v1.vocabulary';

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

async function cached() {
  const raw = await Storage.getItem(CACHE_KEY);
  if (!raw) return undefined;
  try {
    return validateVocabularyDataset(JSON.parse(raw) as VocabularyDataset);
  } catch {
    return undefined;
  }
}

export async function loadVocabulary(): Promise<VocabularyLoadResult> {
  const local = await cached();
  try {
    const response = await fetch(await resolveWebContentUrl('/vocabulary/dataset.json'));
    if (!response.ok) throw new Error(`vocabulary_http_${response.status}`);
    const dataset = validateVocabularyDataset(await response.json() as VocabularyDataset);
    await Storage.setItem(CACHE_KEY, JSON.stringify(dataset));
    return { dataset, source: 'remote' };
  } catch (error) {
    if (local) return { dataset: local, source: 'cache', warning: 'vocabulary_remote_unavailable' };
    throw error;
  }
}
