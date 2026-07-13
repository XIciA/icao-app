import type {
  CardStateMutation,
  DocumentMutation,
  LearningRecordMutation,
  SyncChange,
  SyncMutation,
  SyncPullResponse,
  SyncPushResponse,
} from '@icao/contracts';
import Storage from 'expo-sqlite/kv-store';

import { apiRequest } from '@/platform/api-client';
import { findQuestionBankCardReference } from '@/features/question-bank/annotations/card-index';
import { createEmptyAnnotationStore, replaceAnnotationStoreFromSync } from '@/features/question-bank/annotations/annotation-store';
import type { QuestionBankAnnotationStore } from '@/features/question-bank/annotations/types';
import type { CardLearningState, LearningRecord } from '@/features/question-bank/types';

const META_KEY = 'icao.learning.v3.sync.meta';
const OUTBOX_KEY = 'icao.learning.v3.sync.outbox';
const LEGACY_TOPIC_PREFIX = 'icao.learning.v1.topic.';
const TOPIC_PREFIX = 'icao.learning.v2.topic.';
const MIGRATION_PREFIX = 'icao.learning.v2.migrated.';
const RECORDS_KEY = 'icao.learning.v1.records';
const ANNOTATIONS_KEY = 'icao.annotations.v1';
const SNAPSHOT_PREFIX = 'icao.learning.v3.prebind.';
const MAX_RECORDS = 100;

type SyncMeta = {
  schemaVersion: 3;
  boundUserId?: string;
  cursor: number;
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
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function defaultMeta(): SyncMeta {
  return { schemaVersion: 3, cursor: 0, versions: {} };
}

async function readMeta() {
  return parseJson<SyncMeta>(await Storage.getItem(META_KEY), defaultMeta());
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

function hasAnnotationData(value: QuestionBankAnnotationStore) {
  return Object.keys(value.entries ?? {}).length > 0
    || value.tagDefinitions.some((item) => !item.builtIn)
    || value.highlightDefinitions.some((item) => !item.builtIn);
}

async function localDataSnapshot() {
  const keys = (await Storage.getAllKeys()).filter((key) => key.startsWith(TOPIC_PREFIX) || key.startsWith(LEGACY_TOPIC_PREFIX));
  const values = await Storage.multiGet([...keys, RECORDS_KEY, ANNOTATIONS_KEY]);
  return Object.fromEntries(values.filter(([, value]) => value !== null)) as Record<string, string>;
}

export async function inspectLearningSyncBinding(userId: string) {
  const [meta, snapshot] = await Promise.all([readMeta(), localDataSnapshot()]);
  const hasTopicState = Object.entries(snapshot).some(([key, value]) => key.startsWith(TOPIC_PREFIX) && Object.keys(parseJson(value, {})).length > 0);
  const hasRecords = parseJson<unknown[]>(snapshot[RECORDS_KEY] ?? null, []).length > 0;
  const annotations = parseJson<QuestionBankAnnotationStore | undefined>(snapshot[ANNOTATIONS_KEY] ?? null, undefined);
  const hasLocalData = hasTopicState || hasRecords || Boolean(annotations && hasAnnotationData(annotations));
  return {
    alreadyBound: meta.boundUserId === userId,
    boundToAnotherUser: Boolean(meta.boundUserId && meta.boundUserId !== userId),
    hasLocalData,
    needsConfirmation: meta.boundUserId !== userId && hasLocalData,
  };
}

export async function bindLearningSync(userId: string, mode: 'upload-local' | 'cloud-only') {
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
    const records = parseJson<LearningRecord[]>(snapshot[RECORDS_KEY] ?? null, []);
    records.forEach((record) => mutations.push({
      mutationId: `bind:${userId}:record:${record.id}`,
      kind: 'learning_record',
      payload: { recordId: record.id, record: record as unknown as Record<string, unknown>, occurredAt: record.createdAt },
    }));
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
  }

  const meta: SyncMeta = { schemaVersion: 3, boundUserId: userId, cursor: 0, versions };
  await Storage.multiSet([[META_KEY, JSON.stringify(meta)], [OUTBOX_KEY, JSON.stringify(mutations)]]);
  return runLearningSync(userId);
}

export async function bindEmptyLearningSync(userId: string) {
  const inspection = await inspectLearningSyncBinding(userId);
  if (inspection.alreadyBound) return runLearningSync(userId);
  if (inspection.needsConfirmation) throw new Error('local_data_confirmation_required');
  return bindLearningSync(userId, 'cloud-only');
}

async function activePersonalKeys() {
  return (await Storage.getAllKeys()).filter((key) =>
    key.startsWith(LEGACY_TOPIC_PREFIX)
    || key.startsWith(TOPIC_PREFIX)
    || key.startsWith(MIGRATION_PREFIX)
    || key.startsWith(SNAPSHOT_PREFIX)
    || key.startsWith('icao.ai.consent.')
    || [META_KEY, OUTBOX_KEY, RECORDS_KEY, ANNOTATIONS_KEY].includes(key));
}

async function clearActiveLearningData({ keepSnapshots }: { keepSnapshots: boolean }) {
  const keys = await activePersonalKeys();
  await Storage.multiRemove(keepSnapshots ? keys.filter((key) => !key.startsWith(SNAPSHOT_PREFIX)) : keys);
  await replaceAnnotationStoreFromSync(createEmptyAnnotationStore());
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
    const mutation: LearningRecordMutation = {
      mutationId: `record:${record.id}`,
      kind: 'learning_record',
      payload: { recordId: record.id, record: record as unknown as Record<string, unknown>, occurredAt: record.createdAt },
    };
    if (!outbox.some((item) => item.mutationId === mutation.mutationId)) outbox.push(mutation);
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

async function applyChange(change: SyncChange, meta: SyncMeta) {
  if (change.kind === 'card_state') {
    const payload = change.payload as unknown as CardStateMutation['payload'];
    const key = `${TOPIC_PREFIX}${payload.topicId}`;
    const states = parseJson<Record<string, CardLearningState>>(await Storage.getItem(key), {});
    states[payload.cardId] = payload.state;
    await Storage.setItem(key, JSON.stringify(states));
    meta.versions[cardVersionKey(payload.bankId, payload.topicId, payload.cardId)] = Math.max(
      meta.versions[cardVersionKey(payload.bankId, payload.topicId, payload.cardId)] ?? 0,
      payload.version,
    );
  } else if (change.kind === 'learning_record') {
    const payload = change.payload as unknown as LearningRecordMutation['payload'];
    const records = parseJson<LearningRecord[]>(await Storage.getItem(RECORDS_KEY), []);
    const incoming = payload.record as unknown as LearningRecord;
    await Storage.setItem(RECORDS_KEY, JSON.stringify([incoming, ...records.filter((record) => record.id !== payload.recordId)].slice(0, MAX_RECORDS)));
  } else if (change.kind === 'document') {
    const payload = change.payload as unknown as DocumentMutation['payload'];
    if (payload.documentKey === 'annotations') {
      await replaceAnnotationStoreFromSync(payload.document);
      meta.versions['document:annotations'] = Math.max(meta.versions['document:annotations'] ?? 0, payload.version);
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
  if (running) return running;
  running = (async () => {
    await writeQueue.catch(() => undefined);
    const meta = await readMeta();
    if (!meta.boundUserId || (userId && meta.boundUserId !== userId)) return getLearningSyncStatus();
    let outbox = await readOutbox();
    try {
      while (outbox.length) {
        const batch = outbox.slice(0, 50);
        const response = await apiRequest<SyncPushResponse>('/v1/sync/push', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mutations: batch }),
        });
        for (const result of response.results) await applyAuthoritative(result, meta);
        const processed = new Set(response.results.map((result) => result.mutationId));
        outbox = outbox.filter((mutation) => !processed.has(mutation.mutationId));
        await Storage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
      }

      let hasMore = true;
      while (hasMore) {
        const response = await apiRequest<SyncPullResponse>(`/v1/sync/pull?cursor=${meta.cursor}`);
        for (const change of response.changes) await applyChange(change, meta);
        meta.cursor = response.cursor;
        hasMore = response.hasMore;
      }
      meta.lastSyncedAt = new Date().toISOString();
      delete meta.lastError;
      await Storage.setItem(META_KEY, JSON.stringify(meta));
      return getLearningSyncStatus();
    } catch (error) {
      meta.lastError = error instanceof Error ? error.message : 'sync_failed';
      await Storage.setItem(META_KEY, JSON.stringify(meta));
      throw error;
    }
  })();
  try { return await running; } finally { running = undefined; }
}

export function scheduleLearningSync() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { retryTimer = undefined; void runLearningSync().catch(() => undefined); }, 800);
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
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = undefined;
}
