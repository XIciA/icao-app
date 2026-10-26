import { currentVocabularyPolicy, migrateCurrentVocabulary, subscribeVocabularyCatalog } from './live-catalog';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { assertLearningWriteContext, captureLearningWriteContext, mutateVocabularyInCurrentWorkspace } from '@/features/sync/learning-sync.native';

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
  VocabularyStudySession,
  VocabularyTestResult,
  VocabularyWordProgress,
  VocabularyWordStatus,
} from './types';

let mutationQueue = Promise.resolve();

async function mutateVocabularyState(updater: (state: VocabularyState) => VocabularyState) {
  const context = captureLearningWriteContext();
  let changed = false;
  let result = createEmptyVocabularyState();
  const next = mutationQueue.catch(() => undefined).then(() => mutateVocabularyInCurrentWorkspace(context, async () => {
    const original = await readVocabularyState({ migrate: false });
    const current = migrateCurrentVocabulary(original);
    const updated = updater(current);
    if (updated === current && current === original) {
      result = current;
      return current;
    }
    changed = true;
    result = await writeVocabularyState(updated);
    return result;
  }, () => changed));
  mutationQueue = next.then(() => undefined, () => undefined);
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
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);

  useEffect(() => subscribeVocabularyCatalog(() => { void mutateVocabularyState(current => current).catch(() => undefined); }), []);

  useEffect(() => {
    let active = true;
    setError(false);
    let observedWrite = false;
    const context = captureLearningWriteContext();
    void readVocabularyState().then((next) => {
      if (active && !observedWrite) { assertLearningWriteContext(context); setState(next); setReady(true); }
    }).catch(() => { if (active) setError(true); });
    const unsubscribe = subscribeVocabularyState((next) => { if (active) { observedWrite = true; setState(next); setReady(true); setError(false); } });
    return () => { active = false; unsubscribe(); };
  }, [attempt]);

  return { ready, state, error, retry };
}

export async function setWordFavorite(reference: WordFavoriteReference, favorite: boolean) {
  const updatedAt = new Date().toISOString();
  return mutateVocabularyState((current) => {
    const key = favoriteKeyForWord(reference.word);
    if (!key) return current;
    const words = {
      ...current.words,
      [key]: { ...progressFor(key, current), favorite, updatedAt },
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
      [key]: { ...progressFor(key, current), favorite, updatedAt },
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
        if (!legacy || !key || key === word.id) continue;
        const canonical = words[key];
        if (!legacy.favorite && !canonical) continue;
        if (canonical && Date.parse(canonical.updatedAt) >= Date.parse(legacy.updatedAt)) continue;
        if (!changed) words = { ...current.words };
        words[key] = { ...progressFor(key, current), favorite: legacy.favorite, updatedAt: legacy.updatedAt };
        changed = true;
      }
    }
    return changed ? { ...current, words, updatedAt: migratedAt } : current;
  });
}

export function useWordFavorites() {
  const { ready, state, error, retry } = useVocabularyState();
  const toggleFavorite = useCallback((reference: WordFavoriteReference) => setWordFavorite(reference, !isWordFavorite(reference, state)), [state]);
  const setFavorite = useCallback((reference: WordFavoriteReference, favorite: boolean) => setWordFavorite(reference, favorite), []);
  return { ready, state, error, retry, isFavorite: (reference: WordFavoriteReference) => isWordFavorite(reference, state), toggleFavorite, setFavorite };
}

export function useVocabularyProgress(books: VocabularyBook[]) {
  const { ready, state, error, retry } = useVocabularyState();

  useEffect(() => {
    if (ready && books.length) void migrateLegacyVocabularyFavorites(books).catch(() => { /* Explicit save actions report failures; migration is idempotent and retried on reload. */ });
  }, [books, ready, state.updatedAt]);

  const setStatus = useCallback(async (wordId: string, status: VocabularyWordStatus) => {
    const updatedAt = new Date().toISOString();
    return mutateVocabularyState((current) => {
      const policy=currentVocabularyPolicy(),retired=Object.hasOwn(policy?.retiredIds??{},wordId);
      const target=retired?policy!.retiredIds[wordId]:wordId;
      let studySession=current.studySession;
      if(studySession&&target&&status!=='new'&&studySession.wordIds.includes(target)){
        const answers={...studySession.answers,[target]:status};
        const nextWordId=retired&&studySession.nextWordId===target?studySession.wordIds.find(id=>!answers[id])??null:studySession.nextWordId;
        studySession={...studySession,answers,nextWordId,updatedAt};
      }
      return {...current,words:{...current.words,[wordId]:{...progressFor(wordId,current),status,updatedAt}},...(studySession?{studySession}:{}),updatedAt};
    });
  }, []);

  const toggleFavorite = useCallback((word: { id: string; word: string }) => setWordFavorite({ word: word.word, wordId: word.id }, !isWordFavorite({ word: word.word, wordId: word.id }, state)), [state]);

  const resetBook = useCallback(async (book: VocabularyBook) => {
    const updatedAt = new Date().toISOString();
    return mutateVocabularyState((current) => {
      const words = { ...current.words };
      for (const word of book.words) words[word.id] = { ...progressFor(word.id, current), status: 'new', updatedAt };
      return { ...current, words, updatedAt, ...(current.studySession ? {studySession:{...current.studySession,nextWordId:null,answers:{},updatedAt}} : {}) };
    });
  }, []);

  const saveTestResult = useCallback(async (lastTest: VocabularyTestResult) => mutateVocabularyState((current) => ({
    ...current,
    lastTest,
    updatedAt: lastTest.completedAt,
  })), []);

  const saveStudySession = useCallback(async (studySession:VocabularyStudySession) => mutateVocabularyState(current=>({...current,studySession:{...studySession,answers:current.studySession?.startedAt===studySession.startedAt?{...studySession.answers,...current.studySession.answers}:studySession.answers??{}},updatedAt:studySession.updatedAt})), []);

  const statsByBook = useMemo(() => Object.fromEntries(books.map((book) => [book.id, statsForBook(book, state)])), [books, state]);

  return { ready, state, error, retry, statsByBook, setStatus, toggleFavorite, resetBook, saveTestResult, saveStudySession };
}

export function resetVocabularyMutationQueueForTests() {
  mutationQueue = Promise.resolve();
}
