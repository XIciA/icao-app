import { mergeOfflineAnnotations } from '@icao/contracts/annotation-management';
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
import { setProfileAccount, replaceProfileFromSync } from '@/features/account/profile-store.native';
import { normalizeProfile } from '@/features/account/profile-model';

import { apiRequest } from '@/platform/api-client';
import { getEmbeddedQuestionBanks, loadQuestionBank } from '@/features/question-bank/data/repository.native';
import { createCardDirectory } from '@/features/question-bank/data/card-directory';
import { findQuestionBankCardReference } from '@/features/question-bank/annotations/card-index.native';
import { createEmptyAnnotationStore, replaceAnnotationStoreFromSync } from '@/features/question-bank/annotations/annotation-store.native';
import type { QuestionBankAnnotationStore } from '@/features/question-bank/annotations/types';
import {
  clearAiResultRecords,
  clearLearningRecords,
  deleteLearningRecord,
  getLearningRecords,
  LEARNING_RECORDS_KEY,
  upsertLearningRecord,
} from '@/features/question-bank/platform/learning-record-storage.native';
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

const ACCOUNT_PROFILE_KEY = 'account_profile';
const PROFILE_VERSION_KEY = 'document:account_profile';
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
let accountSwitchQueue = Promise.resolve();
let running: Promise<LearningSyncStatus> | undefined;
let runningUserId: string | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let activeUserId: string | undefined;
let identityEpoch = 0;
let learningResetEpoch = 0;
let aiResetEpoch = 0;

export type LearningWriteContext = { ownerToken: string; aiToken: number };
export function captureLearningWriteContext(accountId?: string): LearningWriteContext {
  if (accountId !== undefined && activeUserId !== accountId) throw new Error('learning_owner_or_generation_changed');
  return { ownerToken: `${identityEpoch}:${learningResetEpoch}`, aiToken: aiResetEpoch };
}
export function assertLearningWriteContext(context: LearningWriteContext, aiResult = false) {
  if (context.ownerToken !== captureLearningWriteContext().ownerToken || (aiResult && context.aiToken !== aiResetEpoch)) {
    throw new Error('learning_owner_or_generation_changed');
  }
}


class SyncIdentityChangedError extends Error {}

function assertSyncIdentity(userId: string | undefined, epoch: number) {
  if (identityEpoch !== epoch || (activeUserId !== undefined && activeUserId !== userId)) {
    throw new SyncIdentityChangedError('sync_identity_changed');
  }
}

export function setLearningSyncActiveUser(userId?: string) {
  setProfileAccount(userId);
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
  const defaults = createEmptyAnnotationStore();
  return (value.version === 2 && (JSON.stringify(value.tagDefinitions) !== JSON.stringify(defaults.tagDefinitions)
    || JSON.stringify(value.highlightDefinitions) !== JSON.stringify(defaults.highlightDefinitions)
    || Boolean(value.deletedDefinitions?.tags.length || value.deletedDefinitions?.highlights.length)))
    || Object.keys(value.entries ?? {}).length > 0
    || value.tagDefinitions.some((item) => !item.builtIn)
    || value.highlightDefinitions.some((item) => !item.builtIn);
}

async function localDataSnapshot() {
  const keys = (await Storage.getAllKeys()).filter((key) => key.startsWith(TOPIC_PREFIX) || key.startsWith(LEGACY_TOPIC_PREFIX));
  const [values, records] = await Promise.all([
    Storage.multiGet([...keys, ANNOTATIONS_KEY, VOCABULARY_STORAGE_KEY]),
    getLearningRecords({ includeDetails: true }),
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
  await inCurrentLearningWorkspace(captureLearningWriteContext(), async () => {
  const snapshot = await localDataSnapshot();
  const snapshotKey = `${SNAPSHOT_PREFIX}${userId}.${Date.now()}`;
  await Storage.setItem(snapshotKey, JSON.stringify(snapshot));

  const mutations: SyncMutation[] = [];
  const versions: Record<string, number> = {};
  if (mode === 'upload-local') {
    const banks = await Promise.all(getEmbeddedQuestionBanks().map(async bank => (await loadQuestionBank(bank.id))?.dataset ?? bank));
    const directory = createCardDirectory(banks);
    const currentTopics = new Set(Object.keys(snapshot)
      .filter((key) => key.startsWith(TOPIC_PREFIX))
      .map((key) => key.slice(TOPIC_PREFIX.length)));
    for (const [key, raw] of Object.entries(snapshot)) {
      if (!key.startsWith(TOPIC_PREFIX) && !key.startsWith(LEGACY_TOPIC_PREFIX)) continue;
      const topicId = key.slice(key.startsWith(TOPIC_PREFIX) ? TOPIC_PREFIX.length : LEGACY_TOPIC_PREFIX.length);
      if (key.startsWith(LEGACY_TOPIC_PREFIX) && currentTopics.has(topicId)) continue;
      const states = parseJson<Record<string, CardLearningState>>(raw, {});
      for (const [cardId, state] of Object.entries(states)) {
        const reference = directory.findLegacy(topicId, cardId);
        if (!reference) throw new Error('部分本机学习记录尚无法关联题库，已保留原记录。请联网后重试同步。');
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
  });
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
  learningResetEpoch += 1;
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

async function clearLearningPayloadData({ includeAiConsent = true, keepSnapshots = true }: { includeAiConsent?: boolean; keepSnapshots?: boolean } = {}) {
  learningResetEpoch += 1;
  const keys = (await activePersonalKeys({ includeAiConsent }))
    .filter((key) => ![META_KEY, OUTBOX_KEY, LEARNING_RECORDS_KEY].includes(key) && !(keepSnapshots && key.startsWith(SNAPSHOT_PREFIX)));
  await Storage.multiRemove(keys);
  await clearLearningRecords();
  await replaceAnnotationStoreFromSync(createEmptyAnnotationStore());
  await replaceVocabularyStateFromSync(createEmptyVocabularyState());
}

/** Swap the existing local learning workspace without merging accounts. */
export async function switchLearningSyncToGuest(): Promise<void> {
  return switchLearningWorkspace();
}
export async function switchLearningSyncAccount(userId: string): Promise<void> {
  return switchLearningWorkspace(userId);
}
async function switchLearningWorkspace(userId?: string): Promise<void> {
  setLearningSyncActiveUser(userId);
  const epoch = identityEpoch;
  const operation = accountSwitchQueue.catch(() => undefined).then(async () => {
    if (running) await running.catch(() => undefined);
    await writeQueue.catch(() => undefined);
    assertSyncIdentity(userId, epoch);
    const previous = await readMeta();
    assertSyncIdentity(userId, epoch);
    const claimKey = userId ? `${SNAPSHOT_PREFIX}guest-claim.${userId}` : undefined;
    const finishClaim = async () => {
      if (!claimKey) return;
      const pending = await Storage.getItem(claimKey);
      if (!pending) return;
      await mergeGuestLearningSnapshot(JSON.parse(pending) as Record<string, string>);
      await Storage.removeItem(`${SNAPSHOT_PREFIX}guest`);
      // Keep the recovery claim until the first successful cloud reconciliation.
    };
    if (previous.boundUserId === userId) { await finishClaim(); if (userId) scheduleLearningSync(); return; }
    // Once started, complete this workspace swap before another swap may begin.
    // Aborting halfway would archive a partly cleared workspace on the next login.
    learningResetEpoch += 1;
    const workspaceKey = (owner?: string) => owner ? `${SNAPSHOT_PREFIX}account.${owner}` : `${SNAPSHOT_PREFIX}guest`;
    const guest = userId && !previous.boundUserId ? await localDataSnapshot() : undefined;
    if (guest && claimKey) await Storage.setItem(claimKey, JSON.stringify(guest));
    const keys = (await Storage.getAllKeys()).filter((key) =>
      key.startsWith(TOPIC_PREFIX) || key.startsWith(LEGACY_TOPIC_PREFIX) || key.startsWith(MIGRATION_PREFIX)
      || key === LEARNING_RECORDS_KEY || key.startsWith(`${LEARNING_RECORDS_KEY}.`)
      || [META_KEY, OUTBOX_KEY, ANNOTATIONS_KEY, VOCABULARY_STORAGE_KEY].includes(key));
    const values = await Storage.multiGet(keys);
    await Storage.setItem(workspaceKey(previous.boundUserId), JSON.stringify(values));
    const saved = await Storage.getItem(workspaceKey(userId));
    await clearLearningPayloadData({ includeAiConsent: false, keepSnapshots: true });
    await replaceQueuedSyncState({ ...defaultMeta(), boundUserId: userId }, []);
    const restored = parseJson<[string, string | null][]>(saved, []);
    const pairs = restored.filter((pair): pair is [string, string] => Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string');
    const restoredMeta = parseJson<SyncMeta>(pairs.find(([key]) => key === META_KEY)?.[1] ?? null, defaultMeta());
    if (restoredMeta.boundUserId === userId) {
      await Storage.multiSet(pairs);
      const annotations = parseJson(pairs.find(([key]) => key === ANNOTATIONS_KEY)?.[1] ?? null, createEmptyAnnotationStore());
      const vocabulary = parseJson(pairs.find(([key]) => key === VOCABULARY_STORAGE_KEY)?.[1] ?? null, createEmptyVocabularyState());
      await replaceAnnotationStoreFromSync(annotations);
      await replaceVocabularyStateFromSync(vocabulary);
    } else {
      await replaceQueuedSyncState({ ...defaultMeta(), boundUserId: userId }, []);
    }
    assertSyncIdentity(userId, epoch);
    // Guest data is claimed once by the account that completes login. Archive
    // remains available for recovery until the merge and outbox writes finish.
    await finishClaim();
    if (userId) scheduleLearningSync();
  });
  accountSwitchQueue = operation.catch(() => undefined);
  return operation;
}

async function mergeGuestLearningSnapshot(snapshot: Record<string, string>) {
  const context = captureLearningWriteContext();
  for (const [key, raw] of Object.entries(snapshot)) {
    if (!key.startsWith(TOPIC_PREFIX)) continue;
    const topicId = key.slice(TOPIC_PREFIX.length);
    const existing = parseJson<Record<string, CardLearningState>>(await Storage.getItem(key), {});
    const incoming = parseJson<Record<string, CardLearningState>>(raw, {});
    for (const [cardId, state] of Object.entries(incoming)) {
      if (existing[cardId] && existing[cardId].updatedAt > state.updatedAt) continue;
      const reference = findQuestionBankCardReference(topicId, cardId);
      if (!reference) throw new Error('guest_learning_reference_unavailable');
      existing[cardId] = state;
      const pending = await readOutbox();
      if (!pending.some(mutation => mutation.kind === 'card_state' && mutation.payload.bankId === reference.bankId
        && mutation.payload.topicId === topicId && mutation.payload.cardId === cardId && JSON.stringify(mutation.payload.state) === JSON.stringify(state))) {
        await enqueueCardState(topicId, cardId, state, reference.bankId, context);
      }
    }
    await Storage.setItem(key, JSON.stringify(existing));
  }
  const records = parseJson<LearningRecord[]>(snapshot[LEARNING_RECORDS_KEY] ?? null, []);
  const existingRecords = new Map((await getLearningRecords({ includeDetails: true })).map(record => [record.id, record]));
  for (const record of records) {
    const previous = existingRecords.get(record.id);
    if (previous && (previous.updatedAt ?? previous.createdAt) > (record.updatedAt ?? record.createdAt)) continue;
    await upsertLearningRecord(record);
    const pending = await readOutbox();
    if (!pending.some(mutation => mutation.kind === 'learning_record' && mutation.payload.recordId === record.id)) {
      await enqueueLearningRecord(record, context);
    }
  }
  const incoming = parseJson<QuestionBankAnnotationStore | undefined>(snapshot[ANNOTATIONS_KEY] ?? null, undefined);
  if (incoming && hasAnnotationData(incoming)) {
    const existing = parseJson<QuestionBankAnnotationStore>(await Storage.getItem(ANNOTATIONS_KEY), createEmptyAnnotationStore());
    const entries = { ...existing.entries };
    for (const [key, entry] of Object.entries(incoming.entries)) {
      if (!entries[key] || entries[key].updatedAt <= entry.updatedAt) entries[key] = entry;
    }
    const mergeDefinitions = (before: typeof existing.tagDefinitions, after: typeof incoming.tagDefinitions) =>
      [...new Map([...after, ...before].map(definition => [definition.id, definition])).values()];
    const merged = { ...existing, entries, tagDefinitions: mergeDefinitions(existing.tagDefinitions, incoming.tagDefinitions),
      highlightDefinitions: mergeDefinitions(existing.highlightDefinitions, incoming.highlightDefinitions) };
    await replaceAnnotationStoreFromSync(merged);
    const pending = await readOutbox();
    if (!pending.some(mutation => mutation.kind === 'document' && mutation.payload.documentKey === 'annotations'
      && JSON.stringify(mutation.payload.document) === JSON.stringify(merged))) await enqueueAnnotationStore(merged, context);
  }
  const guestVocabulary = normalizeVocabularyState(parseJson(snapshot[VOCABULARY_STORAGE_KEY] ?? null, undefined));
  if (hasVocabularyData(guestVocabulary)) {
    const existing = normalizeVocabularyState(parseJson(await Storage.getItem(VOCABULARY_STORAGE_KEY), undefined));
    const words = { ...existing.words };
    for (const [id, word] of Object.entries(guestVocabulary.words)) {
      if (!words[id] || words[id].updatedAt <= word.updatedAt) words[id] = word;
    }
    const lastTest = guestVocabulary.lastTest && (!existing.lastTest || guestVocabulary.lastTest.completedAt > existing.lastTest.completedAt)
      ? guestVocabulary.lastTest : existing.lastTest;
    const merged = { ...existing, words, lastTest, updatedAt: existing.updatedAt > guestVocabulary.updatedAt ? existing.updatedAt : guestVocabulary.updatedAt };
    await replaceVocabularyStateFromSync(merged);
    const pending = await readOutbox();
    if (!pending.some(mutation => mutation.kind === 'document' && mutation.payload.documentKey === VOCABULARY_DOCUMENT_KEY
      && JSON.stringify(mutation.payload.document) === JSON.stringify(merged))) await enqueueVocabularyDocument(merged, context);
  }
}

export async function archiveAndBindEmptyLearningSync(userId: string) {
  const snapshot = await localDataSnapshot();
  await Storage.setItem(`${SNAPSHOT_PREFIX}archive.${Date.now()}`, JSON.stringify(snapshot));
  await clearActiveLearningData({ keepSnapshots: true });
  return bindLearningSync(userId, 'cloud-only');
}

export async function clearPersonalLearningData(ownerUserId?: string) {
  const requestedOwner = ownerUserId ?? activeUserId ?? (await readMeta()).boundUserId;
  if (!requestedOwner) return;
  const operation = accountSwitchQueue.catch(() => undefined).then(async () => {
    if (running) await running.catch(() => undefined);
    const meta = await readMeta();
    if (meta.boundUserId === requestedOwner) await clearActiveLearningData({ keepSnapshots: true });
    const snapshots = (await Storage.getAllKeys()).filter((key) =>
      key === `${SNAPSHOT_PREFIX}guest-claim.${requestedOwner}` || key === `${SNAPSHOT_PREFIX}account.${requestedOwner}` || key.startsWith(`${SNAPSHOT_PREFIX}${requestedOwner}.`));
    if (snapshots.length) await Storage.multiRemove(snapshots);
  });
  accountSwitchQueue = operation.catch(() => undefined);
  await operation;
}

function isAccountProfileMutation(mutation: SyncMutation) {
  return mutation.kind === 'document' && mutation.payload.documentKey === ACCOUNT_PROFILE_KEY;
}

async function resetLearningGeneration(meta: SyncMeta, dataGeneration: number, aiResultGeneration: number, preserveGuestClaim = false) {
  const claimKey = meta.boundUserId ? `${SNAPSHOT_PREFIX}guest-claim.${meta.boundUserId}` : undefined;
  const claim = claimKey && preserveGuestClaim ? await Storage.getItem(claimKey) : undefined;
  if (claimKey && !preserveGuestClaim) await Storage.removeItem(claimKey);
  await clearLearningPayloadData({ includeAiConsent: false });
  // Account profile survives a learning-only reset, including edits not uploaded yet.
  await queuedUpdate((latest, outbox) => {
    const profileVersion = latest.versions[PROFILE_VERSION_KEY] ?? meta.versions[PROFILE_VERSION_KEY];
    latest.versions = profileVersion === undefined ? {} : { [PROFILE_VERSION_KEY]: profileVersion };
    latest.dataGeneration = dataGeneration;
    latest.aiResultGeneration = aiResultGeneration;
    latest.cursor = 0;
    outbox.splice(0, outbox.length, ...outbox.filter(isAccountProfileMutation));
    Object.assign(meta, latest);
  });
  if (claim) await mergeGuestLearningSnapshot(JSON.parse(claim) as Record<string, string>);
}

function isAiResultMutation(mutation: SyncMutation) {
  return mutation.kind === 'learning_record' && mutation.payload.record?.recordType === 'ai_result';
}

export async function inCurrentLearningWorkspace<T>(context: LearningWriteContext, action: () => Promise<T>): Promise<T> {
  assertLearningWriteContext(context);
  const operation = accountSwitchQueue.catch(() => undefined).then(async () => {
    if (running) await running.catch(() => undefined);
    await writeQueue.catch(() => undefined);
    assertLearningWriteContext(context);
    // Finish the accepted operation before another account workspace is restored.
    return action();
  });
  accountSwitchQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function deleteLocalAiResult(recordId: string, context = captureLearningWriteContext()) {
  await inCurrentLearningWorkspace(context, () => deleteLearningRecord(recordId));
}

export async function applyPrivacyAiResultReset(response: { aiResultGeneration: number; dataGeneration: number }, context = captureLearningWriteContext()) {
  await inCurrentLearningWorkspace(context, async () => {
  aiResetEpoch += 1;
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
  });
}

export async function applyPrivacyLearningDataReset(response: { aiResultGeneration: number; dataGeneration: number }, context = captureLearningWriteContext(), clearRelatedData?: () => Promise<void>) {
  await inCurrentLearningWorkspace(context, async () => {
  learningResetEpoch += 1;
  const previous = await readMeta();
  await resetLearningGeneration(previous, response.dataGeneration, response.aiResultGeneration);
  await clearRelatedData?.();
  });
  scheduleLearningSync();
}

export async function enqueueCardState(topicId: string, cardId: string, state: CardLearningState, bankId?: string, context = captureLearningWriteContext()) {
  assertLearningWriteContext(context);
  const reference = bankId ? { bankId } : findQuestionBankCardReference(topicId, cardId);
  await queuedUpdate((meta, outbox) => {
    assertLearningWriteContext(context);
    if (!meta.boundUserId) return;
    if (!reference) throw new Error('学习记录尚无法关联题库，请联网后重试。');
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

export async function enqueueLearningRecord(record: LearningRecord, context = captureLearningWriteContext()) {
  await queuedUpdate((meta, outbox) => {
    assertLearningWriteContext(context, record.recordType === 'ai_result');
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

export async function deleteLearningHistory(recordId: string) {
  const context = captureLearningWriteContext();
  const records = await getLearningRecords();
  const record = records.find((item) => item.id === recordId && item.recordType !== 'ai_result');
  if (!record) return;
  const removed = records.filter((item) => item.id === recordId || (record.sessionId && item.sessionId === record.sessionId));
  await queuedUpdate(async (meta, outbox) => {
    assertLearningWriteContext(context);
    await deleteLearningRecord(recordId);
    for (const item of removed) {
      const key = recordVersionKey(item.id);
      const version = (meta.versions[key] ?? 0) + 1;
      meta.versions[key] = version;
      for (let index = outbox.length - 1; index >= 0; index -= 1) {
        if (outbox[index]?.kind === 'learning_record' && (outbox[index] as LearningRecordMutation).payload.recordId === item.id) outbox.splice(index, 1);
      }
      if (meta.boundUserId) outbox.push({
        mutationId: mutationId(`delete:${item.id}`), kind: 'learning_record',
        payload: { recordId: item.id, deleted: true, record: { recordType: item.recordType, sessionId: item.sessionId },
          ...(item.recordType === 'ai_result' ? { aiResultGeneration: meta.aiResultGeneration } : {}),
          occurredAt: item.createdAt, version, updatedAt: new Date().toISOString() },
      });
    }
  });
  scheduleLearningSync();
}

export async function enqueueAccountProfile(profile: Record<string, unknown>) {
  const epoch = identityEpoch;
  const userId = activeUserId;
  if (!userId) throw new Error('profile_account_required');
  await queuedUpdate((meta, outbox) => {
    assertSyncIdentity(userId, epoch);
    if (meta.boundUserId !== userId) throw new Error('profile_sync_not_bound');
    const version = (meta.versions[PROFILE_VERSION_KEY] ?? 0) + 1;
    meta.versions[PROFILE_VERSION_KEY] = version;
    for (let index = outbox.length - 1; index >= 0; index -= 1) {
      if (isAccountProfileMutation(outbox[index]!)) outbox.splice(index, 1);
    }
    outbox.push({ mutationId: mutationId('account-profile'), kind: 'document', payload: {
      documentKey: ACCOUNT_PROFILE_KEY, document: normalizeProfile(profile),
      version, updatedAt: new Date().toISOString(),
    } });
  });
  scheduleLearningSync();
}

function appendAnnotationStore(meta: SyncMeta, outbox: SyncMutation[], store: QuestionBankAnnotationStore) {
  if (!meta.boundUserId) return;
  const versionKey = 'document:annotations';
  const version = (meta.versions[versionKey] ?? 0) + 1;
  meta.versions[versionKey] = version;
  outbox.push({
    mutationId: mutationId(`${versionKey}:v${version}`),
    kind: 'document',
    payload: { documentKey: 'annotations', document: store as unknown as Record<string, unknown>, version, updatedAt: new Date().toISOString() },
  });
}

export async function enqueueAnnotationStore(store: QuestionBankAnnotationStore, context = captureLearningWriteContext()) {
  assertLearningWriteContext(context);
  await queuedUpdate((meta, outbox) => {
    assertLearningWriteContext(context);
    appendAnnotationStore(meta, outbox, store);
  });
  scheduleLearningSync();
}

/** Local annotation state and its outbox entry commit before a later account swap/reset. */
export async function mutateAnnotationsInCurrentWorkspace(context: LearningWriteContext, update: () => Promise<QuestionBankAnnotationStore>) {
  const result = await inCurrentLearningWorkspace(context, async () => {
    const store = await update();
    // Once accepted, this operation still owns the previous workspace even if
    // activeUserId has changed. The next swap must archive its complete outbox.
    await queuedUpdate((meta, outbox) => appendAnnotationStore(meta, outbox, store));
    return store;
  });
  scheduleLearningSync();
  return result;
}

function appendVocabularyDocument(meta: SyncMeta, outbox: SyncMutation[], state: VocabularyState) {
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
}

export async function enqueueVocabularyDocument(state: VocabularyState, context = captureLearningWriteContext()) {
  assertLearningWriteContext(context);
  await queuedUpdate((meta, outbox) => { assertLearningWriteContext(context); appendVocabularyDocument(meta, outbox, state); });
  scheduleLearningSync();
}

export async function mutateVocabularyInCurrentWorkspace(context: LearningWriteContext, update: () => Promise<VocabularyState>, shouldEnqueue: () => boolean = () => true) {
  const result = await inCurrentLearningWorkspace(context, async () => {
    const state = await update();
    if (shouldEnqueue()) await queuedUpdate((meta, outbox) => appendVocabularyDocument(meta, outbox, state));
    return state;
  });
  scheduleLearningSync();
  return result;
}

function nextSyncBatch(outbox: SyncMutation[]) {
  const batch: SyncMutation[] = [];
  let characters = 0;
  for (const mutation of outbox.slice(0, 50)) {
    const length = JSON.stringify(mutation).length;
    // A long offline history queue must stay below the API's 16 MiB body limit.
    if (batch.length && characters + length > 4_000_000) break;
    batch.push(mutation);
    characters += length;
  }
  return batch;
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
    const isAiResult = payload.deleted !== true && payload.record?.recordType === 'ai_result';
    if (isAiResult && (payload.aiResultGeneration ?? 0) < meta.aiResultGeneration) return;
    const version = payload.version ?? 1;
    const versionKey = recordVersionKey(payload.recordId);
    if (version < (meta.versions[versionKey] ?? 0)) return;
    if (payload.deleted === true) await deleteLearningRecord(payload.recordId, payload.record as Pick<LearningRecord, 'recordType' | 'sessionId'> | undefined);
    else await upsertLearningRecord(payload.record as unknown as LearningRecord);
    meta.versions[versionKey] = Math.max(meta.versions[versionKey] ?? 0, version);
  } else if (change.kind === 'document') {
    const payload = change.payload as unknown as DocumentMutation['payload'];
    const versionKey = `document:${payload.documentKey}`;
    if (payload.version < (meta.versions[versionKey] ?? 0)) return;
    if (payload.documentKey === ACCOUNT_PROFILE_KEY) {
      await replaceProfileFromSync(payload.document);
      meta.versions[versionKey] = Math.max(meta.versions[versionKey] ?? 0, payload.version);
    } else if (payload.documentKey === 'annotations') {
      const pending = await readOutbox();
      const hasNewerLocal = pending.some(mutation => mutation.kind === 'document' && mutation.payload.documentKey === 'annotations'
        && mutation.payload.document.offlineMerge === true);
      const local = hasNewerLocal ? parseJson<Record<string, unknown>>(await Storage.getItem(ANNOTATIONS_KEY), {}) : undefined;
      await replaceAnnotationStoreFromSync(local?.offlineMerge === true ? mergeOfflineAnnotations(payload.document, local) : payload.document);
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
  // New sync work cannot enter a partly reset/restored workspace. Existing work
  // finishes before that same queue starts a swap or privacy reset.
  await accountSwitchQueue;
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
          const batch = nextSyncBatch(outbox);
          const response = await apiRequest<SyncPushResponse>('/v1/sync/push', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-icao-vocabulary-catalog': 'vocabulary-live-v1' },
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
            await resetLearningGeneration(meta, responseDataGeneration, responseAiResultGeneration, true);
            continue;
          }
          const resetAiResults = Boolean(
            response.resetAiResults || responseAiResultGeneration !== meta.aiResultGeneration,
          );
          if (resetAiResults) {
            aiResetEpoch += 1;
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
          const response = await apiRequest<SyncPullResponse>(`/v1/sync/pull?cursor=${meta.cursor}&ownerUserId=${encodeURIComponent(expectedUserId)}`, { headers: { 'x-icao-vocabulary-catalog': 'vocabulary-live-v1' } });
          assertSyncIdentity(expectedUserId, epoch);
          await writeQueue.catch(() => undefined);
          assertSyncIdentity(expectedUserId, epoch);
          mergeSyncProgress(meta, await readMeta());
          const responseDataGeneration = response.dataGeneration ?? meta.dataGeneration;
          const responseAiResultGeneration = response.aiResultGeneration ?? meta.aiResultGeneration;
          if (responseDataGeneration !== meta.dataGeneration) {
            await resetLearningGeneration(meta, responseDataGeneration, responseAiResultGeneration, true);
            // Re-read from zero because older cursors can predate a preserved profile.
            continue;
          } else if (responseAiResultGeneration !== meta.aiResultGeneration) {
            aiResetEpoch += 1;
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
      await Storage.removeItem(`${SNAPSHOT_PREFIX}guest-claim.${expectedUserId}`);
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
  accountSwitchQueue = Promise.resolve();
  running = undefined;
  runningUserId = undefined;
  activeUserId = undefined;
  setProfileAccount(undefined);
  identityEpoch += 1;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = undefined;
}
