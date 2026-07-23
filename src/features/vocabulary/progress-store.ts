import { useCallback, useEffect, useMemo, useState } from 'react';

import { enqueueVocabularyDocument } from '@/features/sync/learning-sync';

import {
  createEmptyVocabularyState,
  readVocabularyState,
  subscribeVocabularyState,
  writeVocabularyState,
} from './persistence';
import {
  favoriteKeyForWord,
  isWordFavorite,
  type WordFavoriteReference,
} from './favorites';
import type {
  VocabularyBook,
  VocabularyBookStats,
  VocabularyState,
  VocabularyTestResult,
  VocabularyWordProgress,
  VocabularyWordStatus,
} from './types';

let mutationQueue = Promise.resolve();

async function mutateVocabularyState(updater: (state: VocabularyState) => VocabularyState) {
  let result = createEmptyVocabularyState();
  const next = mutationQueue.catch(() => undefined).then(async () => {
    const current = await readVocabularyState();
    const updated = updater(current);
    if (updated === current) {
      result = current;
      return;
    }
    result = await writeVocabularyState(updated);
    await enqueueVocabularyDocument(result);
  });
  mutationQueue = next;
  await next;
  return result;
}

export function progressFor(wordId: string, state: VocabularyState): VocabularyWordProgress {
  return state.words[wordId] ?? { status: 'new', favorite: false, updatedAt: new Date(0).toISOString() };
}

export function statsForBook(book: VocabularyBook, state: VocabularyState): VocabularyBookStats {
  const stats: VocabularyBookStats = { total: book.words.length, learned: 0, known: 0, vague: 0, forgot: 0, wrong: 0, favorite: 0 };
  for (const word of book.words) {
    const progress = progressFor(word.id, state);
    if (progress.status !== 'new') stats.learned += 1;
    if (progress.status === 'known') stats.known += 1;
    if (progress.status === 'vague') stats.vague += 1;
    if (progress.status === 'forgot') stats.forgot += 1;
    if (progress.status === 'wrong') stats.wrong += 1;
    if (isWordFavorite({ word: word.word, wordId: word.id }, state)) stats.favorite += 1;
  }
  return stats;
}

export function useVocabularyState() {
  const [state, setState] = useState<VocabularyState>(createEmptyVocabularyState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void readVocabularyState().then((next) => {
      if (active) { setState(next); setReady(true); }
    });
    const unsubscribe = subscribeVocabularyState((next) => { if (active) setState(next); });
    return () => { active = false; unsubscribe(); };
  }, []);

  return { ready, state };
}

export async function setWordFavorite(reference: WordFavoriteReference, favorite: boolean) {
  const updatedAt = new Date().toISOString();
  return mutateVocabularyState((current) => {
    const key = favoriteKeyForWord(reference.word);
    if (!key) return current;
    const words = {
      ...current.words,
      [key]: { status: 'new' as const, favorite, updatedAt },
    };
    if (reference.wordId) {
      words[reference.wordId] = {
        ...progressFor(reference.wordId, current),
        favorite,
        updatedAt,
      };
    }
    return { ...current, words, updatedAt };
  });
}

export async function toggleWordFavorite(reference: WordFavoriteReference) {
  let favorite = false;
  return mutateVocabularyState((current) => {
    favorite = !isWordFavorite(reference, current);
    const updatedAt = new Date().toISOString();
    const key = favoriteKeyForWord(reference.word);
    if (!key) return current;
    const words = {
      ...current.words,
      [key]: { status: 'new' as const, favorite, updatedAt },
    };
    if (reference.wordId) {
      words[reference.wordId] = {
        ...progressFor(reference.wordId, current),
        favorite,
        updatedAt,
      };
    }
    return { ...current, words, updatedAt };
  });
}

export async function migrateLegacyVocabularyFavorites(books: VocabularyBook[]) {
  const migratedAt = new Date().toISOString();
  return mutateVocabularyState((current) => {
    let words = current.words;
    let changed = false;
    for (const book of books) {
      for (const word of book.words) {
        const legacy = current.words[word.id];
        const key = favoriteKeyForWord(word.word);
        if (!legacy || !key) continue;
        const canonical = words[key];
        if (!legacy.favorite && !canonical) continue;
        if (canonical && Date.parse(canonical.updatedAt) >= Date.parse(legacy.updatedAt)) continue;
        if (!changed) words = { ...current.words };
        words[key] = { status: 'new', favorite: legacy.favorite, updatedAt: legacy.updatedAt };
        changed = true;
      }
    }
    return changed ? { ...current, words, updatedAt: migratedAt } : current;
  });
}

export function useWordFavorites() {
  const { ready, state } = useVocabularyState();
  const toggleFavorite = useCallback((reference: WordFavoriteReference) => toggleWordFavorite(reference), []);
  const setFavorite = useCallback((reference: WordFavoriteReference, favorite: boolean) => setWordFavorite(reference, favorite), []);
  return { ready, state, isFavorite: (reference: WordFavoriteReference) => isWordFavorite(reference, state), toggleFavorite, setFavorite };
}

export function useVocabularyProgress(books: VocabularyBook[]) {
  const { ready, state } = useVocabularyState();

  useEffect(() => {
    if (ready && books.length) void migrateLegacyVocabularyFavorites(books);
  }, [books, ready, state.updatedAt]);

  const setStatus = useCallback(async (wordId: string, status: VocabularyWordStatus) => {
    const updatedAt = new Date().toISOString();
    return mutateVocabularyState((current) => ({
      ...current,
      words: { ...current.words, [wordId]: { ...progressFor(wordId, current), status, updatedAt } },
      updatedAt,
    }));
  }, []);

  const toggleFavorite = useCallback((word: { id: string; word: string }) => toggleWordFavorite({ word: word.word, wordId: word.id }), []);

  const resetBook = useCallback(async (book: VocabularyBook) => {
    const updatedAt = new Date().toISOString();
    return mutateVocabularyState((current) => {
      const words = { ...current.words };
      for (const word of book.words) words[word.id] = { ...progressFor(word.id, current), status: 'new', updatedAt };
      return { ...current, words, updatedAt };
    });
  }, []);

  const saveTestResult = useCallback(async (lastTest: VocabularyTestResult) => mutateVocabularyState((current) => ({
    ...current,
    lastTest,
    updatedAt: lastTest.completedAt,
  })), []);

  const statsByBook = useMemo(() => Object.fromEntries(books.map((book) => [book.id, statsForBook(book, state)])), [books, state]);

  return { ready, state, statsByBook, setStatus, toggleFavorite, resetBook, saveTestResult };
}

export function resetVocabularyMutationQueueForTests() {
  mutationQueue = Promise.resolve();
}
