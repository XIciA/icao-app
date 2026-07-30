import Storage from '@/platform/storage';

import type { VocabularyState, VocabularyTestResult, VocabularyWordProgress, VocabularyWordStatus } from './types';

export const VOCABULARY_STORAGE_KEY = 'icao.vocabulary.v1.state';
export const VOCABULARY_DOCUMENT_KEY = 'vocabulary';

const statuses = new Set<VocabularyWordStatus>(['new', 'known', 'vague', 'forgot', 'wrong']);
const listeners = new Set<(state: VocabularyState) => void>();

export function createEmptyVocabularyState(): VocabularyState {
  return { schemaVersion: 1, words: {}, updatedAt: new Date(0).toISOString() };
}

function validDate(value: unknown, fallback = new Date(0).toISOString()) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : fallback;
}

function normalizeProgress(value: unknown): VocabularyWordProgress | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const progress = value as Partial<VocabularyWordProgress>;
  if (!statuses.has(progress.status as VocabularyWordStatus)) return undefined;
  return {
    status: progress.status as VocabularyWordStatus,
    favorite: Boolean(progress.favorite),
    updatedAt: validDate(progress.updatedAt),
  };
}

function normalizeTestResult(value: unknown): VocabularyTestResult | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const result = value as VocabularyTestResult;
  if (result.schemaVersion !== 1 || !Number.isInteger(result.total) || !Array.isArray(result.answers)) return undefined;
  return { ...result, completedAt: validDate(result.completedAt) };
}

export function normalizeVocabularyState(value: unknown): VocabularyState {
  if (!value || typeof value !== 'object') return createEmptyVocabularyState();
  const candidate = value as Partial<VocabularyState>;
  const words: Record<string, VocabularyWordProgress> = {};
  if (candidate.words && typeof candidate.words === 'object') {
    for (const [wordId, rawProgress] of Object.entries(candidate.words)) {
      const progress = normalizeProgress(rawProgress);
      if (wordId && progress) words[wordId] = progress;
    }
  }
  const lastTest = normalizeTestResult(candidate.lastTest);
  return {
    schemaVersion: 1,
    words,
    ...(lastTest ? { lastTest } : {}),
    updatedAt: validDate(candidate.updatedAt),
  };
}

export async function readVocabularyState() {
  const raw = await Storage.getItem(VOCABULARY_STORAGE_KEY);
  if (!raw) return createEmptyVocabularyState();
  try { return normalizeVocabularyState(JSON.parse(raw)); } catch { return createEmptyVocabularyState(); }
}

export async function replaceVocabularyStateFromSync(value: unknown) {
  const state = normalizeVocabularyState(value);
  await Storage.setItem(VOCABULARY_STORAGE_KEY, JSON.stringify(state));
  listeners.forEach((listener) => listener(state));
  return state;
}

export async function writeVocabularyState(state: VocabularyState) {
  const normalized = normalizeVocabularyState(state);
  await Storage.setItem(VOCABULARY_STORAGE_KEY, JSON.stringify(normalized));
  listeners.forEach((listener) => listener(normalized));
  return normalized;
}

export function hasVocabularyData(state: VocabularyState) {
  return Object.keys(state.words).length > 0 || Boolean(state.lastTest);
}

export function subscribeVocabularyState(listener: (state: VocabularyState) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
