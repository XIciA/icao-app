import { normalizeAnnotationDefinitions } from '@icao/contracts/annotation-management';
import Storage from '@/platform/storage';

import { assertLearningWriteContext, captureLearningWriteContext, inCurrentLearningWorkspace, mutateAnnotationsInCurrentWorkspace, type LearningWriteContext } from '@/features/sync/learning-sync.native';

import { getEmbeddedQuestionBanks } from '../data/repository';
import type { QuestionBankId } from '../types';
import { questionBankCardTargetKey } from './card-index';
import {
  DEFAULT_ANNOTATION_HIGHLIGHTS,
  DEFAULT_ANNOTATION_TAGS,
  type AnnotationHighlight,
  type AnnotationTextBlockId,
  type QuestionAnnotationEntry,
  type QuestionBankAnnotationStore,
  type QuestionBankCardTarget,
} from './types';

export const ANNOTATION_STORAGE_KEY = 'icao.annotations.v1';
const BANK_IDS = new Set<QuestionBankId>(getEmbeddedQuestionBanks().map((bank) => bank.id));
const listeners = new Set<() => void>();
let cachedStore: QuestionBankAnnotationStore | undefined;
let cachedOwner: string | undefined;
let latestSave: { ownerToken: string; result: Promise<boolean> } | undefined;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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
    version: 2,
    legacyImported: true,
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
  const deleted = value.deletedDefinitions && isObject(value.deletedDefinitions) ? value.deletedDefinitions : {};
  const ids = (values: unknown) => Array.isArray(values) ? values.filter((id): id is string => typeof id === 'string') : [];
  const deletedDefinitions = { tags: ids(deleted.tags), highlights: ids(deleted.highlights) };
  const tagDefinitions = normalizeAnnotationDefinitions(value.tagDefinitions, DEFAULT_ANNOTATION_TAGS, deletedDefinitions.tags);
  const highlightDefinitions = normalizeAnnotationDefinitions(value.highlightDefinitions, DEFAULT_ANNOTATION_HIGHLIGHTS, deletedDefinitions.highlights);
  for (const entry of Object.values(entries)) {
    entry.tagIds = entry.tagIds.filter((id) => tagDefinitions.some((d) => d.id === id));
    entry.highlights = entry.highlights.filter((h) => highlightDefinitions.some((d) => d.id === h.colorId));
  }
  return {
    version: 2, deletedDefinitions,
    legacyImported: value.legacyImported === true,
    tagDefinitions,
    highlightDefinitions,
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

function publishStore(store: QuestionBankAnnotationStore, context: LearningWriteContext) {
  cachedStore = store;
  cachedOwner = context.ownerToken;
  // An accepted write finishes before a queued workspace swap, but must not
  // notify the next account with the previous account's transient cache.
  if (context.ownerToken === captureLearningWriteContext().ownerToken) emitChange();
}

async function readInWorkspace(context: LearningWriteContext, force = false) {
  if (!force && cachedStore && cachedOwner === context.ownerToken) return cachedStore;
  const store = (await readStoredValue()) ?? createEmptyAnnotationStore();
  publishStore(store, context);
  return store;
}

export async function readAnnotationStore({ force = false }: { force?: boolean } = {}) {
  const context = captureLearningWriteContext();
  try {
    const store = await inCurrentLearningWorkspace(context, () => readInWorkspace(context, force));
    return context.ownerToken === captureLearningWriteContext().ownerToken ? store : createEmptyAnnotationStore();
  } catch (error) {
    // A subscription may have queued this read just before logout/reset. Its
    // obsolete screen must neither receive another owner's data nor reject.
    if (context.ownerToken !== captureLearningWriteContext().ownerToken) return createEmptyAnnotationStore();
    throw error;
  }
}

export async function updateAnnotationStore(updater: (store: QuestionBankAnnotationStore) => QuestionBankAnnotationStore) {
  const context = captureLearningWriteContext();
  const operation = mutateAnnotationsInCurrentWorkspace(context, async () => {
    const current = await readInWorkspace(context);
    const next = normalizeAnnotationStore(updater(current));
    // Keep a failed local write available to the existing Retry action, scoped
    // to this owner. A reset or account restoration replaces this same cache.
    publishStore(next, context);
    await Storage.setItem(ANNOTATION_STORAGE_KEY, JSON.stringify(next));
    return next;
  });
  // Observe the existing workspace operation; do not introduce another queue.
  // Its result includes both the local document and the automatic-sync outbox.
  latestSave = { ownerToken: context.ownerToken, result: operation.then(() => true, () => false) };
  return operation;
}

export async function flushPendingAnnotationSaves(context = captureLearningWriteContext()): Promise<boolean> {
  try {
    while (true) {
      assertLearningWriteContext(context);
      const pending = latestSave;
      if (!pending || pending.ownerToken !== context.ownerToken) return true;
      const saved = await pending.result;
      assertLearningWriteContext(context);
      // A later queued write carries the entire current store, including edits
      // retained after a failure. Wait for that write before allowing departure.
      if (latestSave === pending) return saved;
    }
  } catch {
    return false;
  }
}

/** Called only by the sync owner while its pull/reset/workspace operation owns the workspace. */
export async function replaceAnnotationStoreFromSync(value: unknown) {
  const next = normalizeAnnotationStore(value);
  await Storage.setItem(ANNOTATION_STORAGE_KEY, JSON.stringify(next));
  publishStore(next, captureLearningWriteContext());
  return next;
}

export async function retryAnnotationStoreWrite() {
  return updateAnnotationStore(store => store);
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
  cachedOwner = undefined;
  latestSave = undefined;
}
