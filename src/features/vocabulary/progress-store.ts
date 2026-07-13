import { useCallback, useEffect, useMemo, useState } from 'react';

import { enqueueVocabularyDocument } from '@/features/sync/learning-sync';

import {
  createEmptyVocabularyState,
  readVocabularyState,
  subscribeVocabularyState,
  writeVocabularyState,
} from './persistence';
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
    result = await writeVocabularyState(updater(current));
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
    if (progress.favorite) stats.favorite += 1;
  }
  return stats;
}

export function useVocabularyProgress(books: VocabularyBook[]) {
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

  const setStatus = useCallback(async (wordId: string, status: VocabularyWordStatus) => {
    const updatedAt = new Date().toISOString();
    return mutateVocabularyState((current) => ({
      ...current,
      words: { ...current.words, [wordId]: { ...progressFor(wordId, current), status, updatedAt } },
      updatedAt,
    }));
  }, []);

  const toggleFavorite = useCallback(async (wordId: string) => {
    const updatedAt = new Date().toISOString();
    return mutateVocabularyState((current) => {
      const progress = progressFor(wordId, current);
      return {
        ...current,
        words: { ...current.words, [wordId]: { ...progress, favorite: !progress.favorite, updatedAt } },
        updatedAt,
      };
    });
  }, []);

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
