import type {
  CardStateMutation,
  DocumentMutation,
  LearningRecordMutation,
  SyncChange,
  SyncMutation,
  SyncPullResponse,
  SyncPushResponse,
} from '@icao/contracts';
import Storage from '@/platform/storage';

import { apiRequest } from '@/platform/api-client';
import { findQuestionBankCardReference } from '@/features/question-bank/annotations/card-index';
import { createEmptyAnnotationStore, replaceAnnotationStoreFromSync } from '@/features/question-bank/annotations/annotation-store';
import type { QuestionBankAnnotationStore } from '@/features/question-bank/annotations/types';
import {
  clearAiResultRecords,
  clearLearningRecords,
  deleteLearningRecord,
  getLearningRecords,
  LEARNING_RECORDS_KEY,
  upsertLearningRecord,
} from '@/features/question-bank/platform/learning-record-storage';
import type { CardLearningState, LearningRecord } from '@/features/question-bank/types';
import {
  createEmptyVocabularyState,
  hasVocabularyData,
  normalizeVocabularyState,
  replaceVocabularyStateFromSync,
  VOCABULARY_DOCUMENT_KEY,
  VOCABULARY_STORAGE_KEY,
} from '@/features/vocabulary/persistence';
import type { VocabularyState } from '@/features/vocabulary/types';

const META_KEY = 'icao.learning.v3.sync.meta';
const OUTBOX_KEY = 'icao.learning.v3.sync.outbox';
const LEGACY_TOPIC_PREFIX = 'icao.learning.v1.topic.';
const TOPIC_PREFIX = 'icao.learning.v2.topic.';
const MIGRATION_PREFIX = 'icao.learning.v2.migrated.';
const ANNOTATIONS_KEY = 'icao.annotations.v1';
const SNAPSHOT_PREFIX = 'icao.learning.v3.prebind.';

type SyncMeta = {
  schemaVersion: 3;
  boundUserId?: string;
  cursor: number;
  dataGeneration: number;
  aiResultGeneration: number;
  versions: Record<string, number>;
  lastSyncedAt?: string;
  lastError?: string;
};

export type LearningSyncStatus = {
  boundUserId?: string;
  pendingCount: number;
  cursor: number;
  lastSyncedAt?: string;
  lastError?: string;
};

let writeQueue = Promise.resolve();
let running: Promise<LearningSyncStatus> | undefined;
let runningUserId: string | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let activeUserId: string | undefined;
let identityEpoch = 0;

class SyncIdentityChangedError extends Error {}

function assertSyncIdentity(userId: string, epoch: number) {
  if (identityEpoch !== epoch || (activeUserId !== undefined && activeUserId !== userId)) {
    throw new SyncIdentityChangedError('sync_identity_changed');
  }
}

export function setLearningSyncActiveUser(userId?: string) {
  if (activeUserId === userId) return;
  activeUserId = userId;
  identityEpoch += 1;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = undefined;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function defaultMeta(): SyncMeta {
  return { schemaVersion: 3, cursor: 0, dataGeneration: 0, aiResultGeneration: 0, versions: {} };
}

async function readMeta() {
  const parsed = parseJson<Partial<SyncMeta>>(await Storage.getItem(META_KEY), defaultMeta());
  return {
    ...defaultMeta(),
    ...parsed,
    schemaVersion: 3 as const,
    dataGeneration: Number.isSafeInteger(parsed.dataGeneration) ? parsed.dataGeneration! : 0,
    aiResultGeneration: Number.isSafeInteger(parsed.aiResultGeneration) ? parsed.aiResultGeneration! : 0,
    versions: parsed.versions ?? {},
  };
}

async function readOutbox() {
  return parseJson<SyncMutation[]>(await Storage.getItem(OUTBOX_KEY), []);
}

function mutationId(prefix: string) {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function cardVersionKey(bankId: string, topicId: string, cardId: string) {
  return `card:${bankId}:${topicId}:${cardId}`;
}

function recordVersionKey(recordId: string) {
  return `record:${recordId}`;
}

async function queuedUpdate(updater: (meta: SyncMeta, outbox: SyncMutation[]) => Promise<void> | void) {
  const next = writeQueue.catch(() => undefined).then(async () => {
    const meta = await readMeta();
    const outbox = await readOutbox();
    await updater(meta, outbox);
    await Storage.setItem(META_KEY, JSON.stringify(meta));
    await Storage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  });
  writeQueue = next;
  await next;
}

async function replaceQueuedSyncState(meta: SyncMeta, outbox: SyncMutation[]) {
  const next = writeQueue.catch(() => undefined).then(() => Storage.multiSet([
    [META_KEY, JSON.stringify(meta)],
    [OUTBOX_KEY, JSON.stringify(outbox)],
  ]));
  writeQueue = next;
  await next;
}

function mergeSyncProgress(target: SyncMeta, source: SyncMeta) {
  target.cursor = Math.max(target.cursor, source.cursor);
  target.dataGeneration = Math.max(target.dataGeneration, source.dataGeneration);
  target.aiResultGeneration = Math.max(target.aiResultGeneration, source.aiResultGeneration);
  for (const [key, version] of Object.entries(source.versions)) {
    target.versions[key] = Math.max(target.versions[key] ?? 0, version);
  }
}

function hasAnnotationData(value: QuestionBankAnnotationStore) {
  return Object.keys(value.entries ?? {}).length > 0
    || value.tagDefinitions.some((item) => !item.builtIn)
    || value.highlightDefinitions.some((item) => !item.builtIn);
}

async function localDataSnapshot() {
  const keys = (await Storage.getAllKeys()).filter((key) => key.startsWith(TOPIC_PREFIX) || key.startsWith(LEGACY_TOPIC_PREFIX));
  const [values, records] = await Promise.all([
    Storage.multiGet([...keys, ANNOTATIONS_KEY, VOCABULARY_STORAGE_KEY]),
    getLearningRecords(),
  ]);
  const snapshot = Object.fromEntries(values.filter(([, value]) => value !== null)) as Record<string, string>;
  if (records.length) snapshot[LEARNING_RECORDS_KEY] = JSON.stringify(records);
  return snapshot;
}

export async function inspectLearningSyncBinding(userId: string) {
  const [meta, snapshot] = await Promise.all([readMeta(), localDataSnapshot()]);
  const hasTopicState = Object.entries(snapshot).some(([key, value]) => key.startsWith(TOPIC_PREFIX) && Object.keys(parseJson(value, {})).length > 0);
  const hasRecords = parseJson<unknown[]>(snapshot[LEARNING_RECORDS_KEY] ?? null, []).length > 0;
  const annotations = parseJson<QuestionBankAnnotationStore | undefined>(snapshot[ANNOTATIONS_KEY] ?? null, undefined);
  const vocabulary = normalizeVocabularyState(parseJson<unknown>(snapshot[VOCABULARY_STORAGE_KEY] ?? null, undefined));
  const hasLocalData = hasTopicState || hasRecords || Boolean(annotations && hasAnnotationData(annotations)) || hasVocabularyData(vocabulary);
  return {
    alreadyBound: meta.boundUserId === userId,
    boundToAnotherUser: Boolean(meta.boundUserId && meta.boundUserId !== userId),
    hasLocalData,
    needsConfirmation: meta.boundUserId !== userId && hasLocalData,
  };
}

export async function bindLearningSync(userId: string, mode: 'upload-local' | 'cloud-only') {
  if (activeUserId !== undefined && activeUserId !== userId) throw new Error('sync_user_mismatch');
  if (running) await running.catch(() => undefined);
  const snapshot = await localDataSnapshot();
  const snapshotKey = `${SNAPSHOT_PREFIX}${userId}.${Date.now()}`;
  await Storage.setItem(snapshotKey, JSON.stringify(snapshot));

  const mutations: SyncMutation[] = [];
  const versions: Record<string, number> = {};
  if (mode === 'upload-local') {
    const currentTopics = new Set(Object.keys(snapshot)
      .filter((key) => key.startsWith(TOPIC_PREFIX))
      .map((key) => key.slice(TOPIC_PREFIX.length)));
    for (const [key, raw] of Object.entries(snapshot)) {
      if (!key.startsWith(TOPIC_PREFIX) && !key.startsWith(LEGACY_TOPIC_PREFIX)) continue;
      const topicId = key.slice(key.startsWith(TOPIC_PREFIX) ? TOPIC_PREFIX.length : LEGACY_TOPIC_PREFIX.length);
      if (key.startsWith(LEGACY_TOPIC_PREFIX) && currentTopics.has(topicId)) continue;
      const states = parseJson<Record<string, CardLearningState>>(raw, {});
      for (const [cardId, state] of Object.entries(states)) {
        const reference = findQuestionBankCardReference(topicId, cardId);
        if (!reference) continue;
        const versionKey = cardVersionKey(reference.bankId, topicId, cardId);
        versions[versionKey] = 1;
        mutations.push({
          mutationId: `bind:${userId}:${versionKey}:v1`,
          kind: 'card_state',
          payload: {
            bankId: reference.bankId,
            topicId,
            cardId,
            state,
            version: 1,
            updatedAt: state.updatedAt,
          },
        });
      }
    }
    const records = parseJson<LearningRecord[]>(snapshot[LEARNING_RECORDS_KEY] ?? null, []);
    records.forEach((record) => {
      const versionKey = recordVersionKey(record.id);
      versions[versionKey] = 1;
      mutations.push({
        mutationId: mutationId(`bind:${versionKey}:v1`),
        kind: 'learning_record',
        payload: {
          recordId: record.id,
          record: record as unknown as Record<string, unknown>,
          occurredAt: record.createdAt,
          version: 1,
          updatedAt: record.updatedAt ?? record.createdAt,
        },
      });
    });
    const annotations = parseJson<QuestionBankAnnotationStore | undefined>(snapshot[ANNOTATIONS_KEY] ?? null, undefined);
    if (annotations && hasAnnotationData(annotations)) {
      versions['document:annotations'] = 1;
      mutations.push({
        mutationId: `bind:${userId}:document:annotations:v1`,
        kind: 'document',
        payload: {
          documentKey: 'annotations',
          document: annotations as unknown as Record<string, unknown>,
          version: 1,
          updatedAt: new Date().toISOString(),
        },
      });
    }
    const vocabulary = normalizeVocabularyState(parseJson<unknown>(snapshot[VOCABULARY_STORAGE_KEY] ?? null, undefined));
    if (hasVocabularyData(vocabulary)) {
      versions[`document:${VOCABULARY_DOCUMENT_KEY}`] = 1;
      mutations.push({
        mutationId: `bind:${userId}:document:${VOCABULARY_DOCUMENT_KEY}:v1`,
        kind: 'document',
        payload: {
          documentKey: VOCABULARY_DOCUMENT_KEY,
          document: vocabulary as unknown as Record<string, unknown>,
          version: 1,
          updatedAt: vocabulary.updatedAt,
        },
      });
    }
  }

  const meta: SyncMeta = {
    schemaVersion: 3,
    boundUserId: userId,
    cursor: 0,
    dataGeneration: 0,
    aiResultGeneration: 0,
    versions,
  };
  await replaceQueuedSyncState(meta, mutations);
  return runLearningSync(userId);
}

export async function bindEmptyLearningSync(userId: string) {
  const inspection = await inspectLearningSyncBinding(userId);
  if (inspection.alreadyBound) return runLearningSync(userId);
  if (inspection.needsConfirmation) throw new Error('local_data_confirmation_required');
  return bindLearningSync(userId, 'cloud-only');
}

async function activePersonalKeys({ includeAiConsent = true }: { includeAiConsent?: boolean } = {}) {
  return (await Storage.getAllKeys()).filter((key) =>
    key.startsWith(LEGACY_TOPIC_PREFIX)
    || key.startsWith(TOPIC_PREFIX)
    || key.startsWith(MIGRATION_PREFIX)
    || key.startsWith(SNAPSHOT_PREFIX)
    || (includeAiConsent && key.startsWith('icao.ai.consent.'))
    || [META_KEY, OUTBOX_KEY, LEARNING_RECORDS_KEY, ANNOTATIONS_KEY, VOCABULARY_STORAGE_KEY].includes(key));
}

async function clearActiveLearningData({ keepSnapshots }: { keepSnapshots: boolean }) {
  if (running) await running.catch(() => undefined);
  const keys = await activePersonalKeys();
  const keysToRemove = (keepSnapshots ? keys.filter((key) => !key.startsWith(SNAPSHOT_PREFIX)) : keys)
    .filter((key) => key !== LEARNING_RECORDS_KEY);
  const next = writeQueue.catch(() => undefined).then(() => Storage.multiRemove(keysToRemove));
  writeQueue = next;
  await next;
  await clearLearningRecords();
  await replaceAnnotationStoreFromSync(createEmptyAnnotationStore());
  await replaceVocabularyStateFromSync(createEmptyVocabularyState());
}

async function clearLearningPayloadData({ includeAiConsent = true }: { includeAiConsent?: boolean } = {}) {
  const keys = (await activePersonalKeys({ includeAiConsent }))
    .filter((key) => ![META_KEY, OUTBOX_KEY, LEARNING_RECORDS_KEY].includes(key));
  await Storage.multiRemove(keys);
  await clearLearningRecords();
  await replaceAnnotationStoreFromSync(createEmptyAnnotationStore());
  await replaceVocabularyStateFromSync(createEmptyVocabularyState());
}

export async function archiveAndBindEmptyLearningSync(userId: string) {
  const snapshot = await localDataSnapshot();
  await Storage.setItem(`${SNAPSHOT_PREFIX}archive.${Date.now()}`, JSON.stringify(snapshot));
  await clearActiveLearningData({ keepSnapshots: true });
  return bindLearningSync(userId, 'cloud-only');
}

export async function clearPersonalLearningData() {
  await clearActiveLearningData({ keepSnapshots: false });
}

function isAiResultMutation(mutation: SyncMutation) {
  return mutation.kind === 'learning_record' && mutation.payload.record?.recordType === 'ai_result';
}

export async function deleteLocalAiResult(recordId: string) {
  await deleteLearningRecord(recordId);
}

export async function applyPrivacyAiResultReset(response: { aiResultGeneration: number; dataGeneration: number }) {
  if (running) await running.catch(() => undefined);
  const aiResultIds = (await getLearningRecords())
    .filter((record) => record.recordType === 'ai_result')
    .map((record) => record.id);
  await clearAiResultRecords();
  await queuedUpdate((meta, outbox) => {
    meta.dataGeneration = Math.max(meta.dataGeneration, response.dataGeneration);
    meta.aiResultGeneration = response.aiResultGeneration;
    for (let index = outbox.length - 1; index >= 0; index -= 1) {
      if (isAiResultMutation(outbox[index]!)) outbox.splice(index, 1);
    }
    aiResultIds.forEach((recordId) => { delete meta.versions[recordVersionKey(recordId)]; });
  });
}

export async function applyPrivacyLearningDataReset(response: { aiResultGeneration: number; dataGeneration: number }) {
  if (running) await running.catch(() => undefined);
  const previous = await readMeta();
  await clearLearningPayloadData({ includeAiConsent: false });
  await replaceQueuedSyncState({
    schemaVersion: 3,
    boundUserId: previous.boundUserId,
    cursor: previous.cursor,
    dataGeneration: response.dataGeneration,
    aiResultGeneration: response.aiResultGeneration,
    versions: {},
    lastSyncedAt: new Date().toISOString(),
  }, []);
}

export async function enqueueCardState(topicId: string, cardId: string, state: CardLearningState) {
  const reference = findQuestionBankCardReference(topicId, cardId);
  if (!reference) return;
  await queuedUpdate((meta, outbox) => {
    if (!meta.boundUserId) return;
    const versionKey = cardVersionKey(reference.bankId, topicId, cardId);
    const version = (meta.versions[versionKey] ?? 0) + 1;
    meta.versions[versionKey] = version;
    const mutation: CardStateMutation = {
      mutationId: mutationId(`${versionKey}:v${version}`),
      kind: 'card_state',
      payload: { bankId: reference.bankId, topicId, cardId, state, version, updatedAt: state.updatedAt },
    };
    outbox.push(mutation);
  });
  scheduleLearningSync();
}

export async function enqueueLearningRecord(record: LearningRecord) {
  await queuedUpdate((meta, outbox) => {
    if (!meta.boundUserId) return;
    const versionKey = recordVersionKey(record.id);
    const version = (meta.versions[versionKey] ?? 0) + 1;
    meta.versions[versionKey] = version;
    for (let index = outbox.length - 1; index >= 0; index -= 1) {
      const item = outbox[index];
      if (item?.kind === 'learning_record' && item.payload.recordId === record.id) outbox.splice(index, 1);
    }
    const mutation: LearningRecordMutation = {
      mutationId: mutationId(`${versionKey}:v${version}`),
      kind: 'learning_record',
      payload: {
        recordId: record.id,
        record: record as unknown as Record<string, unknown>,
        ...(record.recordType === 'ai_result' ? { aiResultGeneration: meta.aiResultGeneration } : {}),
        occurredAt: record.createdAt,
        version,
        updatedAt: record.updatedAt ?? record.createdAt,
      },
    };
    outbox.push(mutation);
  });
  scheduleLearningSync();
}

export async function enqueueAnnotationStore(store: QuestionBankAnnotationStore) {
  await queuedUpdate((meta, outbox) => {
    if (!meta.boundUserId) return;
    const versionKey = 'document:annotations';
    const version = (meta.versions[versionKey] ?? 0) + 1;
    meta.versions[versionKey] = version;
    const mutation: DocumentMutation = {
      mutationId: mutationId(`${versionKey}:v${version}`),
      kind: 'document',
      payload: {
        documentKey: 'annotations',
        document: store as unknown as Record<string, unknown>,
        version,
        updatedAt: new Date().toISOString(),
      },
    };
    outbox.push(mutation);
  });
  scheduleLearningSync();
}

export async function enqueueVocabularyDocument(state: VocabularyState) {
  await queuedUpdate((meta, outbox) => {
    if (!meta.boundUserId) return;
    const versionKey = `document:${VOCABULARY_DOCUMENT_KEY}`;
    const version = (meta.versions[versionKey] ?? 0) + 1;
    meta.versions[versionKey] = version;
    for (let index = outbox.length - 1; index >= 0; index -= 1) {
      const item = outbox[index];
      if (item?.kind === 'document' && item.payload.documentKey === VOCABULARY_DOCUMENT_KEY) outbox.splice(index, 1);
    }
    outbox.push({
      mutationId: mutationId(`${versionKey}:v${version}`),
      kind: 'document',
      payload: {
        documentKey: VOCABULARY_DOCUMENT_KEY,
        document: state as unknown as Record<string, unknown>,
        version,
        updatedAt: state.updatedAt,
      },
    });
  });
  scheduleLearningSync();
}

async function applyChange(change: SyncChange, meta: SyncMeta) {
  if (change.kind === 'card_state') {
    const payload = change.payload as unknown as CardStateMutation['payload'];
    const versionKey = cardVersionKey(payload.bankId, payload.topicId, payload.cardId);
    if (payload.version < (meta.versions[versionKey] ?? 0)) return;
    const key = `${TOPIC_PREFIX}${payload.topicId}`;
    const states = parseJson<Record<string, CardLearningState>>(await Storage.getItem(key), {});
    states[payload.cardId] = payload.state;
    await Storage.setItem(key, JSON.stringify(states));
    meta.versions[versionKey] = Math.max(meta.versions[versionKey] ?? 0, payload.version);
  } else if (change.kind === 'learning_record') {
    const payload = change.payload as unknown as LearningRecordMutation['payload'];
    const isAiResult = payload.deleted === true || payload.record?.recordType === 'ai_result';
    if (isAiResult && (payload.aiResultGeneration ?? 0) < meta.aiResultGeneration) return;
    const version = payload.version ?? 1;
    const versionKey = recordVersionKey(payload.recordId);
    if (version < (meta.versions[versionKey] ?? 0)) return;
    if (payload.deleted === true) await deleteLearningRecord(payload.recordId);
    else await upsertLearningRecord(payload.record as unknown as LearningRecord);
    meta.versions[versionKey] = Math.max(meta.versions[versionKey] ?? 0, version);
  } else if (change.kind === 'document') {
    const payload = change.payload as unknown as DocumentMutation['payload'];
    const versionKey = `document:${payload.documentKey}`;
    if (payload.version < (meta.versions[versionKey] ?? 0)) return;
    if (payload.documentKey === 'annotations') {
      await replaceAnnotationStoreFromSync(payload.document);
      meta.versions[versionKey] = Math.max(meta.versions[versionKey] ?? 0, payload.version);
    } else if (payload.documentKey === VOCABULARY_DOCUMENT_KEY) {
      await replaceVocabularyStateFromSync(payload.document);
      meta.versions[versionKey] = Math.max(meta.versions[versionKey] ?? 0, payload.version);
    }
  }
}

async function applyAuthoritative(result: SyncPushResponse['results'][number], meta: SyncMeta) {
  const value = result.authoritative;
  if (!value) return;
  if (value.bankId && value.topicId && value.cardId && value.state) {
    await applyChange({
      cursor: meta.cursor,
      kind: 'card_state',
      entityKey: `${value.bankId}:${value.topicId}:${value.cardId}`,
      payload: value as unknown as Record<string, unknown>,
      version: value.version,
      changedAt: value.updatedAt,
    }, meta);
  } else if (value.recordId && (value.record || value.deleted) && value.occurredAt) {
    await applyChange({
      cursor: meta.cursor,
      kind: 'learning_record',
      entityKey: value.recordId,
      payload: {
        recordId: value.recordId,
        ...(value.record ? { record: value.record } : {}),
        ...(value.deleted ? { deleted: true } : {}),
        ...(value.aiResultGeneration === undefined ? {} : { aiResultGeneration: value.aiResultGeneration }),
        occurredAt: value.occurredAt,
        version: value.version,
        updatedAt: value.updatedAt,
      },
      version: value.version,
      changedAt: value.updatedAt,
    }, meta);
  } else if (value.documentKey && value.document) {
    await applyChange({
      cursor: meta.cursor,
      kind: 'document',
      entityKey: value.documentKey,
      payload: value as unknown as Record<string, unknown>,
      version: value.version,
      changedAt: value.updatedAt,
    }, meta);
  }
}

export async function runLearningSync(userId?: string): Promise<LearningSyncStatus> {
  const expectedUserId = userId ?? activeUserId;
  if (!expectedUserId || (activeUserId !== undefined && activeUserId !== expectedUserId)) return getLearningSyncStatus();
  if (running) {
    if (runningUserId === expectedUserId) return running;
    await running.catch(() => undefined);
    return runLearningSync(expectedUserId);
  }
  const epoch = identityEpoch;
  const operation = (async () => {
    await writeQueue.catch(() => undefined);
    assertSyncIdentity(expectedUserId, epoch);
    const meta = await readMeta();
    if (meta.boundUserId !== expectedUserId) return getLearningSyncStatus();
    try {
      while (true) {
        while (true) {
          await writeQueue.catch(() => undefined);
          assertSyncIdentity(expectedUserId, epoch);
          mergeSyncProgress(meta, await readMeta());
          const outbox = await readOutbox();
          if (!outbox.length) break;
          const batch = outbox.slice(0, 50);
          const response = await apiRequest<SyncPushResponse>('/v1/sync/push', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-icao-vocabulary-catalog': 'three-books-v3' },
            body: JSON.stringify({
              ownerUserId: expectedUserId,
              cursor: meta.cursor,
              dataGeneration: meta.dataGeneration,
              aiResultGeneration: meta.aiResultGeneration,
              mutations: batch,
            }),
          });
          assertSyncIdentity(expectedUserId, epoch);
          await writeQueue.catch(() => undefined);
          assertSyncIdentity(expectedUserId, epoch);
          mergeSyncProgress(meta, await readMeta());
          const responseDataGeneration = response.dataGeneration ?? meta.dataGeneration;
          const responseAiResultGeneration = response.aiResultGeneration ?? meta.aiResultGeneration;
          if (response.resetLearningData || responseDataGeneration !== meta.dataGeneration) {
            await clearLearningPayloadData({ includeAiConsent: false });
            meta.cursor = response.cursor;
            meta.dataGeneration = responseDataGeneration;
            meta.aiResultGeneration = responseAiResultGeneration;
            meta.versions = {};
            await replaceQueuedSyncState({ ...meta }, []);
            continue;
          }
          const resetAiResults = Boolean(
            response.resetAiResults || responseAiResultGeneration !== meta.aiResultGeneration,
          );
          if (resetAiResults) {
            await clearAiResultRecords();
            meta.aiResultGeneration = responseAiResultGeneration;
          }
          for (const result of response.results) {
            assertSyncIdentity(expectedUserId, epoch);
            await applyAuthoritative(result, meta);
          }
          const processed = new Set(response.results.map((result) => result.mutationId));
          await queuedUpdate((latestMeta, latestOutbox) => {
            assertSyncIdentity(expectedUserId, epoch);
            mergeSyncProgress(latestMeta, meta);
            for (let index = latestOutbox.length - 1; index >= 0; index -= 1) {
              if (processed.has(latestOutbox[index]!.mutationId)
                || (resetAiResults && isAiResultMutation(latestOutbox[index]!))) latestOutbox.splice(index, 1);
            }
            latestMeta.dataGeneration = responseDataGeneration;
            latestMeta.aiResultGeneration = responseAiResultGeneration;
          });
        }

        let hasMore = true;
        while (hasMore) {
          await writeQueue.catch(() => undefined);
          assertSyncIdentity(expectedUserId, epoch);
          mergeSyncProgress(meta, await readMeta());
          const response = await apiRequest<SyncPullResponse>(`/v1/sync/pull?cursor=${meta.cursor}&ownerUserId=${encodeURIComponent(expectedUserId)}`, { headers: { 'x-icao-vocabulary-catalog': 'three-books-v3' } });
          assertSyncIdentity(expectedUserId, epoch);
          await writeQueue.catch(() => undefined);
          assertSyncIdentity(expectedUserId, epoch);
          mergeSyncProgress(meta, await readMeta());
          const responseDataGeneration = response.dataGeneration ?? meta.dataGeneration;
          const responseAiResultGeneration = response.aiResultGeneration ?? meta.aiResultGeneration;
          if (responseDataGeneration !== meta.dataGeneration) {
            await clearLearningPayloadData({ includeAiConsent: false });
            meta.dataGeneration = responseDataGeneration;
            meta.aiResultGeneration = responseAiResultGeneration;
            meta.versions = {};
            await replaceQueuedSyncState({ ...meta }, []);
          } else if (responseAiResultGeneration !== meta.aiResultGeneration) {
            await clearAiResultRecords();
            meta.aiResultGeneration = responseAiResultGeneration;
            await queuedUpdate((latestMeta, latestOutbox) => {
              latestMeta.aiResultGeneration = responseAiResultGeneration;
              for (let index = latestOutbox.length - 1; index >= 0; index -= 1) {
                if (isAiResultMutation(latestOutbox[index]!)) latestOutbox.splice(index, 1);
              }
            });
          }
          for (const change of response.changes) {
            assertSyncIdentity(expectedUserId, epoch);
            await applyChange(change, meta);
          }
          meta.cursor = Math.max(meta.cursor, response.cursor);
          hasMore = response.hasMore;
          await queuedUpdate((latestMeta) => {
            assertSyncIdentity(expectedUserId, epoch);
            mergeSyncProgress(latestMeta, meta);
          });
        }

        await writeQueue.catch(() => undefined);
        assertSyncIdentity(expectedUserId, epoch);
        if ((await readOutbox()).length === 0) break;
      }
      await queuedUpdate((latestMeta) => {
        assertSyncIdentity(expectedUserId, epoch);
        mergeSyncProgress(latestMeta, meta);
        latestMeta.lastSyncedAt = new Date().toISOString();
        delete latestMeta.lastError;
      });
      return getLearningSyncStatus();
    } catch (error) {
      if (error instanceof SyncIdentityChangedError) return getLearningSyncStatus();
      await queuedUpdate((latestMeta) => {
        assertSyncIdentity(expectedUserId, epoch);
        mergeSyncProgress(latestMeta, meta);
        latestMeta.lastError = error instanceof Error ? error.message : 'sync_failed';
      });
      throw error;
    }
  })();
  running = operation;
  runningUserId = expectedUserId;
  try {
    return await operation;
  } finally {
    if (running === operation) {
      running = undefined;
      runningUserId = undefined;
    }
  }
}

export function scheduleLearningSync() {
  if (retryTimer) clearTimeout(retryTimer);
  const userId = activeUserId;
  if (!userId) {
    retryTimer = undefined;
    return;
  }
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    if (activeUserId === userId) void runLearningSync(userId).catch(() => undefined);
  }, 800);
}

export async function getLearningSyncStatus(): Promise<LearningSyncStatus> {
  await writeQueue.catch(() => undefined);
  const [meta, outbox] = await Promise.all([readMeta(), readOutbox()]);
  return {
    boundUserId: meta.boundUserId,
    pendingCount: outbox.length,
    cursor: meta.cursor,
    lastSyncedAt: meta.lastSyncedAt,
    lastError: meta.lastError,
  };
}

export function resetLearningSyncForTests() {
  writeQueue = Promise.resolve();
  running = undefined;
  runningUserId = undefined;
  activeUserId = undefined;
  identityEpoch += 1;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = undefined;
}
