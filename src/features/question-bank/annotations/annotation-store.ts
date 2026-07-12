import Storage from 'expo-sqlite/kv-store';

import { enqueueAnnotationStore } from '@/features/sync/learning-sync';

import { getEmbeddedQuestionBanks } from '../data/repository';
import { sqliteLearningStore } from '../platform/learning-store';
import type { CardLearningState, QuestionBankId } from '../types';
import { getQuestionBankCardReference, questionBankCardTargetKey } from './card-index';
import { contentFingerprint, wordContextAt } from './text';
import {
  DEFAULT_ANNOTATION_HIGHLIGHTS,
  DEFAULT_ANNOTATION_TAGS,
  type AnnotationDefinition,
  type AnnotationHighlight,
  type AnnotationTextBlockId,
  type AnnotationToneKey,
  type QuestionAnnotationEntry,
  type QuestionBankAnnotationStore,
  type QuestionBankCardTarget,
} from './types';

export const ANNOTATION_STORAGE_KEY = 'icao.annotations.v1';
const TONES = new Set<AnnotationToneKey>(['green', 'yellow', 'red', 'blue']);
const BANK_IDS = new Set<QuestionBankId>(getEmbeddedQuestionBanks().map((bank) => bank.id));
const listeners = new Set<() => void>();
let cachedStore: QuestionBankAnnotationStore | undefined;
let initialization: Promise<QuestionBankAnnotationStore> | undefined;
let writeQueue = Promise.resolve();

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isTone(value: unknown): value is AnnotationToneKey {
  return typeof value === 'string' && TONES.has(value as AnnotationToneKey);
}

function normalizeDefinition(value: unknown): AnnotationDefinition | undefined {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id) return undefined;
  if (typeof value.label !== 'string' || !value.label.trim() || !isTone(value.color)) return undefined;
  return { id: value.id, label: value.label.trim().slice(0, 8), color: value.color, builtIn: value.builtIn === true };
}

function normalizeDefinitions(value: unknown, defaults: AnnotationDefinition[]) {
  const definitions = new Map(defaults.map((item) => [item.id, item]));
  if (Array.isArray(value)) {
    value.forEach((item) => {
      const definition = normalizeDefinition(item);
      if (!definition || definitions.has(definition.id)) return;
      definitions.set(definition.id, { ...definition, builtIn: false });
    });
  }
  return Array.from(definitions.values());
}

function normalizeHighlight(value: unknown): AnnotationHighlight | undefined {
  if (!isObject(value)) return undefined;
  if (value.blockId !== 'question' && value.blockId !== 'reference') return undefined;
  if (typeof value.wordIndex !== 'number' || !Number.isFinite(value.wordIndex)) return undefined;
  if (typeof value.colorId !== 'string' || !value.colorId) return undefined;
  return {
    blockId: value.blockId as AnnotationTextBlockId,
    wordIndex: Math.max(0, Math.floor(value.wordIndex)),
    colorId: value.colorId,
    quote: typeof value.quote === 'string' ? value.quote : '',
    sentence: typeof value.sentence === 'string' ? value.sentence : '',
    contentFingerprint: typeof value.contentFingerprint === 'string' ? value.contentFingerprint : '',
  };
}

function normalizeEntry(value: unknown): QuestionAnnotationEntry | undefined {
  if (!isObject(value) || typeof value.bankId !== 'string' || !BANK_IDS.has(value.bankId as QuestionBankId)) return undefined;
  if (typeof value.categoryId !== 'string' || !value.categoryId || typeof value.topicId !== 'string' || !value.topicId || typeof value.cardId !== 'string' || !value.cardId) return undefined;
  const highlights = new Map<string, AnnotationHighlight>();
  if (Array.isArray(value.highlights)) {
    value.highlights.forEach((item) => {
      const highlight = normalizeHighlight(item);
      if (highlight) highlights.set(`${highlight.blockId}:${highlight.wordIndex}`, highlight);
    });
  }
  return {
    bankId: value.bankId as QuestionBankId,
    categoryId: value.categoryId,
    topicId: value.topicId,
    cardId: value.cardId,
    tagIds: Array.isArray(value.tagIds) ? Array.from(new Set(value.tagIds.filter((item): item is string => typeof item === 'string' && Boolean(item)))) : [],
    highlights: Array.from(highlights.values()),
    note: typeof value.note === 'string' ? value.note : '',
    updatedAt: typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt)) ? new Date(value.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export function createEmptyAnnotationStore(): QuestionBankAnnotationStore {
  return {
    version: 1,
    legacyImported: false,
    tagDefinitions: DEFAULT_ANNOTATION_TAGS,
    highlightDefinitions: DEFAULT_ANNOTATION_HIGHLIGHTS,
    entries: {},
  };
}

export function normalizeAnnotationStore(value: unknown): QuestionBankAnnotationStore {
  if (!isObject(value)) return createEmptyAnnotationStore();
  const entries: Record<string, QuestionAnnotationEntry> = {};
  if (isObject(value.entries)) {
    Object.values(value.entries).forEach((item) => {
      const entry = normalizeEntry(item);
      if (entry) entries[questionBankCardTargetKey(entry)] = entry;
    });
  }
  return {
    version: 1,
    legacyImported: value.legacyImported === true,
    tagDefinitions: normalizeDefinitions(value.tagDefinitions, DEFAULT_ANNOTATION_TAGS),
    highlightDefinitions: normalizeDefinitions(value.highlightDefinitions, DEFAULT_ANNOTATION_HIGHLIGHTS),
    entries,
  };
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

async function readStoredValue() {
  const raw = await Storage.getItem(ANNOTATION_STORAGE_KEY);
  if (!raw) return undefined;
  try {
    return normalizeAnnotationStore(JSON.parse(raw) as unknown);
  } catch {
    return createEmptyAnnotationStore();
  }
}

function legacyHighlight(target: QuestionBankCardTarget, value: NonNullable<CardLearningState['highlights']>[number]): AnnotationHighlight {
  const reference = getQuestionBankCardReference(target);
  const sourceText = value.blockId === 'question' ? reference?.card.audioText ?? '' : reference?.card.referenceText ?? '';
  const context = wordContextAt(sourceText, value.wordIndex);
  return {
    blockId: value.blockId,
    wordIndex: value.wordIndex,
    colorId: value.colorId,
    quote: value.quote || context?.quote || '',
    sentence: context?.sentence ?? '',
    contentFingerprint: context ? contentFingerprint(sourceText) : '',
  };
}

async function importLegacyAnnotations(store: QuestionBankAnnotationStore) {
  const entries = { ...store.entries };
  for (const bank of getEmbeddedQuestionBanks()) {
    for (const category of bank.categories) {
      for (const topic of category.topics) {
        const states = await sqliteLearningStore.getTopicStates(topic);
        for (const card of topic.cards) {
          const legacy = states[card.id];
          if (!legacy || (!legacy.note.trim() && !legacy.tagIds?.length && !legacy.highlights?.length)) continue;
          const target: QuestionBankCardTarget = { bankId: bank.id, categoryId: category.id, topicId: topic.id, cardId: card.id };
          const key = questionBankCardTargetKey(target);
          if (entries[key]) continue;
          entries[key] = {
            ...target,
            tagIds: legacy.tagIds ? [...legacy.tagIds] : [],
            highlights: (legacy.highlights ?? []).map((highlight) => legacyHighlight(target, highlight)),
            note: legacy.note,
            updatedAt: legacy.updatedAt,
          };
        }
      }
    }
  }
  return { ...store, entries, legacyImported: true };
}

async function writeStore(store: QuestionBankAnnotationStore) {
  await Storage.setItem(ANNOTATION_STORAGE_KEY, JSON.stringify(store));
}

export async function readAnnotationStore({ force = false }: { force?: boolean } = {}) {
  if (!force && cachedStore) return cachedStore;
  if (initialization) return initialization;
  initialization = (async () => {
    await writeQueue.catch(() => undefined);
    let store = (await readStoredValue()) ?? createEmptyAnnotationStore();
    if (!store.legacyImported) {
      store = await importLegacyAnnotations(store);
      await writeStore(store);
    }
    cachedStore = store;
    emitChange();
    return store;
  })();
  try {
    return await initialization;
  } finally {
    initialization = undefined;
  }
}

export async function updateAnnotationStore(updater: (store: QuestionBankAnnotationStore) => QuestionBankAnnotationStore) {
  const current = cachedStore ?? await readAnnotationStore();
  const next = normalizeAnnotationStore(updater(current));
  cachedStore = next;
  emitChange();
  const queued = writeQueue.catch(() => undefined).then(() => writeStore(next));
  writeQueue = queued;
  await queued;
  await enqueueAnnotationStore(next);
  return next;
}

export async function replaceAnnotationStoreFromSync(value: unknown) {
  const next = normalizeAnnotationStore(value);
  cachedStore = next;
  emitChange();
  const queued = writeQueue.catch(() => undefined).then(() => writeStore(next));
  writeQueue = queued;
  await queued;
  return next;
}

export async function retryAnnotationStoreWrite() {
  const store = await readAnnotationStore();
  const queued = writeQueue.catch(() => undefined).then(() => writeStore(store));
  writeQueue = queued;
  await queued;
  return store;
}

export function subscribeAnnotationStore(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAnnotationEntry(store: QuestionBankAnnotationStore, target: QuestionBankCardTarget) {
  return store.entries[questionBankCardTargetKey(target)];
}

export function createEmptyAnnotationEntry(target: QuestionBankCardTarget): QuestionAnnotationEntry {
  return { ...target, tagIds: [], highlights: [], note: '', updatedAt: new Date().toISOString() };
}

export function setAnnotationEntry(store: QuestionBankAnnotationStore, target: QuestionBankCardTarget, entry: QuestionAnnotationEntry) {
  const entries = { ...store.entries };
  const key = questionBankCardTargetKey(target);
  if (!entry.tagIds.length && !entry.highlights.length && !entry.note.trim()) delete entries[key];
  else entries[key] = { ...entry, ...target, updatedAt: new Date().toISOString() };
  return { ...store, entries };
}

export function createAnnotationDefinitionId(prefix: 'tag' | 'highlight') {
  return `custom-${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function resetAnnotationStoreCacheForTests() {
  cachedStore = undefined;
  initialization = undefined;
  writeQueue = Promise.resolve();
}
