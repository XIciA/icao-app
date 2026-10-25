import type { StaticWordLookupEntry } from '@/features/question-bank/static-word-lookup/repository';
import { vocabularyRetiredFavoriteKeys } from '@icao/contracts';

import type { VocabularyBook, VocabularyState, VocabularyWord, VocabularyWordProgress } from './types';

export const WORD_FAVORITE_KEY_PREFIX = '__word_favorite__:v1:';

export type WordFavoriteReference = {
  word: string;
  wordId?: string;
};

export type WordFavoriteItem = {
  key: string;
  word: string;
  meaning: string;
  aviationMeaning?: string;
  generalMeaning?: string;
  example?: string;
  exampleTranslation?: string;
  bookNames: string[];
  wordIds: string[];
  sources: ('vocabulary' | 'lookup')[];
  updatedAt: string;
};

const apostrophes = /[‘’‛ʻʼ]/g;
const hyphens = /[‐‑‒–—―−]/g;

export function normalizeFavoriteWord(value: string) {
  return value
    .normalize('NFKC')
    .replace(apostrophes, "'")
    .replace(hyphens, '-')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US');
}

export function favoriteKeyForWord(value: string) {
  const normalized = normalizeFavoriteWord(value);
  if (!normalized) return undefined;
  const key = `${WORD_FAVORITE_KEY_PREFIX}${encodeURIComponent(normalized)}`;
  // Lookup aliases and the surviving learning card share a single favorite owner.
  return vocabularyRetiredFavoriteKeys[key] ?? key;
}

export function favoriteWordFromKey(key: string) {
  if (!key.startsWith(WORD_FAVORITE_KEY_PREFIX)) return undefined;
  try {
    return decodeURIComponent(key.slice(WORD_FAVORITE_KEY_PREFIX.length));
  } catch {
    return undefined;
  }
}

export function favoriteProgressFor(reference: WordFavoriteReference, state: VocabularyState): VocabularyWordProgress | undefined {
  const key = favoriteKeyForWord(reference.word);
  const canonical = key ? state.words[key] : undefined;
  if (canonical) return canonical;
  return reference.wordId ? state.words[reference.wordId] : undefined;
}

export function isWordFavorite(reference: WordFavoriteReference, state: VocabularyState) {
  return Boolean(favoriteProgressFor(reference, state)?.favorite);
}

export function wordFavoriteUpdatedAt(reference: WordFavoriteReference, state: VocabularyState) {
  return favoriteProgressFor(reference, state)?.updatedAt ?? new Date(0).toISOString();
}

export function buildWordFavoriteItems({
  books,
  lookupEntries,
  state,
}: {
  books: VocabularyBook[];
  lookupEntries: StaticWordLookupEntry[];
  state: VocabularyState;
}) {
  const lookupByWord = new Map(lookupEntries.map((entry) => [normalizeFavoriteWord(entry.word), entry]));
  const vocabularyByWord = new Map<string, { bookNames: Set<string>; word: VocabularyWord }>();

  for (const book of books) {
    for (const word of book.words) {
      const key = normalizeFavoriteWord(word.word);
      const current = vocabularyByWord.get(key);
      if (current) current.bookNames.add(book.name);
      else vocabularyByWord.set(key, { bookNames: new Set([book.name]), word });
    }
  }

  const favoriteWords = new Map<string, string>();
  for (const [key, progress] of Object.entries(state.words)) {
    const word = favoriteWordFromKey(key);
    if (word && progress.favorite) favoriteWords.set(word, progress.updatedAt);
  }
  for (const [wordKey, vocabulary] of vocabularyByWord) {
    if (isWordFavorite({ word: vocabulary.word.word, wordId: vocabulary.word.id }, state)) {
      favoriteWords.set(wordKey, wordFavoriteUpdatedAt({ word: vocabulary.word.word, wordId: vocabulary.word.id }, state));
    }
  }

  return Array.from(favoriteWords, ([canonicalWord, updatedAt]) => {
    const vocabulary = vocabularyByWord.get(canonicalWord);
    const lookup = lookupByWord.get(canonicalWord);
    if (!vocabulary && !lookup) return undefined;
    const sources: WordFavoriteItem['sources'] = [
      ...(vocabulary ? ['vocabulary' as const] : []),
      ...(lookup ? ['lookup' as const] : []),
    ];
    return {
      key: favoriteKeyForWord(canonicalWord)!,
      word: vocabulary?.word.word ?? lookup!.word,
      meaning: vocabulary?.word.meaning ?? lookup!.aviationMeaning,
      ...(lookup ? { aviationMeaning: lookup.aviationMeaning, generalMeaning: lookup.generalMeaning } : {}),
      ...(vocabulary?.word.example ? { example: vocabulary.word.example } : {}),
      ...(vocabulary?.word.exampleTranslation ? { exampleTranslation: vocabulary.word.exampleTranslation } : {}),
      bookNames: vocabulary ? Array.from(vocabulary.bookNames) : [],
      wordIds: vocabulary ? [vocabulary.word.id] : [],
      sources,
      updatedAt,
    } satisfies WordFavoriteItem;
  }).filter((item): item is WordFavoriteItem => Boolean(item))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.word.localeCompare(right.word, 'en'));
}
