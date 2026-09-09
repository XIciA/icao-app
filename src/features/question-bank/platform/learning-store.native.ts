import Storage from '@/platform/storage';

import { assertLearningWriteContext, captureLearningWriteContext, enqueueCardState, enqueueLearningRecord, type LearningWriteContext } from '@/features/sync/learning-sync.native';

import type { CardLearningState, LearningRecord, QuestionBankCard, QuestionBankTopic } from '../types';
import { getLearningRecords, resetLearningRecordStorageForTests, upsertLearningRecord } from './learning-record-storage.native';

const LEGACY_TOPIC_PREFIX = 'icao.learning.v1.topic.';
const TOPIC_PREFIX = 'icao.learning.v2.topic.';
const MIGRATION_PREFIX = 'icao.learning.v2.migrated.';
const topicWriteQueues = new Map<string, Promise<void>>();

export type LearningStore = {
  getCardState(topicId: string, cardId: string): Promise<CardLearningState | undefined>;
  saveCardState(topicId: string, cardId: string, state: CardLearningState, bankId?: string, context?: LearningWriteContext): Promise<void>;
  getTopicStates(topic: QuestionBankTopic): Promise<Record<string, CardLearningState>>;
  addRecord(record: LearningRecord, context?: LearningWriteContext): Promise<void>;
  getRecords(): Promise<LearningRecord[]>;
};

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function hasCompletionEvidence(state: Partial<CardLearningState>) {
  return state.selectedChoiceIndex !== undefined
    || Boolean(state.recorded)
    || Boolean(state.note?.trim())
    || Boolean(state.tagIds?.length)
    || Boolean(state.highlights?.length);
}

export function migrateLegacyCardState(state: Partial<CardLearningState>): CardLearningState {
  return {
    ...state,
    visited: Boolean(state.visited),
    completed: state.completed ?? hasCompletionEvidence(state),
    note: state.note ?? '',
    updatedAt: state.updatedAt ?? new Date(0).toISOString(),
  };
}

function normalizeTopicStates(value: Record<string, Partial<CardLearningState>>) {
  return Object.fromEntries(
    Object.entries(value).map(([cardId, state]) => [cardId, migrateLegacyCardState(state)]),
  );
}

async function readTopicStates(topicId: string) {
  const context = captureLearningWriteContext();
  const key = `${TOPIC_PREFIX}${topicId}`;
  const previousWrite = topicWriteQueues.get(key) ?? Promise.resolve();
  let result: Record<string, CardLearningState> = {};
  const readOrMigrate = previousWrite.catch(() => undefined).then(async () => {
    const current = normalizeTopicStates(parseJson<Record<string, Partial<CardLearningState>>>(await Storage.getItem(key), {}));
    const migrationComplete = await Storage.getItem(`${MIGRATION_PREFIX}${topicId}`);
    if (migrationComplete) {
      result = current;
      return;
    }

    const legacy = normalizeTopicStates(parseJson<Record<string, Partial<CardLearningState>>>(
      await Storage.getItem(`${LEGACY_TOPIC_PREFIX}${topicId}`),
      {},
    ));
    result = { ...legacy, ...current };
    assertLearningWriteContext(context);
    if (Object.keys(result).length > 0) await Storage.setItem(key, JSON.stringify(result));
    await Storage.setItem(`${MIGRATION_PREFIX}${topicId}`, '1');
  });
  topicWriteQueues.set(key, readOrMigrate);
  try {
    await readOrMigrate;
  } finally {
    if (topicWriteQueues.get(key) === readOrMigrate) topicWriteQueues.delete(key);
  }
  return result;
}

export async function readTopicStatesBatch(topics: readonly QuestionBankTopic[]) {
  const context = captureLearningWriteContext();
  const topicIds = topics.map((topic) => topic.id);
  await Promise.all(topicIds.map((topicId) => (
    topicWriteQueues.get(`${TOPIC_PREFIX}${topicId}`)?.catch(() => undefined)
  )));

  const keys = topicIds.flatMap((topicId) => [
    `${TOPIC_PREFIX}${topicId}`,
    `${MIGRATION_PREFIX}${topicId}`,
    `${LEGACY_TOPIC_PREFIX}${topicId}`,
  ]);
  const values = new Map(await Storage.multiGet(keys));
  const writes: [string, string][] = [];
  const statesByTopic: Record<string, Record<string, CardLearningState>> = {};

  topicIds.forEach((topicId) => {
    const currentKey = `${TOPIC_PREFIX}${topicId}`;
    const current = normalizeTopicStates(parseJson<Record<string, Partial<CardLearningState>>>(
      values.get(currentKey) ?? null,
      {},
    ));
    if (values.get(`${MIGRATION_PREFIX}${topicId}`)) {
      statesByTopic[topicId] = current;
      return;
    }

    const legacy = normalizeTopicStates(parseJson<Record<string, Partial<CardLearningState>>>(
      values.get(`${LEGACY_TOPIC_PREFIX}${topicId}`) ?? null,
      {},
    ));
    const merged = { ...legacy, ...current };
    statesByTopic[topicId] = merged;
    if (Object.keys(merged).length > 0) writes.push([currentKey, JSON.stringify(merged)]);
    writes.push([`${MIGRATION_PREFIX}${topicId}`, '1']);
  });

  assertLearningWriteContext(context);
  if (writes.length > 0) await Storage.multiSet(writes);
  return statesByTopic;
}

export const sqliteLearningStore: LearningStore = {
  async getCardState(topicId, cardId) {
    const states = await readTopicStates(topicId);
    return states[cardId];
  },
  async saveCardState(topicId, cardId, state, bankId, context = captureLearningWriteContext()) {
    const key = `${TOPIC_PREFIX}${topicId}`;
    const previousWrite = topicWriteQueues.get(key) ?? Promise.resolve();
    const nextWrite = previousWrite
      .catch(() => undefined)
      .then(async () => {
        assertLearningWriteContext(context);
        const states = normalizeTopicStates(
          parseJson<Record<string, Partial<CardLearningState>>>(await Storage.getItem(key), {}),
        );
        assertLearningWriteContext(context);
        const normalized = migrateLegacyCardState(state);
        await Storage.setItem(key, JSON.stringify({ ...states, [cardId]: normalized }));
        await enqueueCardState(topicId, cardId, normalized, bankId, context);
      });

    topicWriteQueues.set(key, nextWrite);
    try {
      await nextWrite;
    } finally {
      if (topicWriteQueues.get(key) === nextWrite) topicWriteQueues.delete(key);
    }
  },
  async getTopicStates(topic) {
    return readTopicStates(topic.id);
  },
  async addRecord(record, context = captureLearningWriteContext()) {
    assertLearningWriteContext(context, record.recordType === 'ai_result');
    await upsertLearningRecord(record, () => assertLearningWriteContext(context, record.recordType === 'ai_result'));
    assertLearningWriteContext(context, record.recordType === 'ai_result');
    await enqueueLearningRecord(record, context);
  },
  async getRecords() {
    return getLearningRecords();
  },
};

/** Cumulative progress belongs to card states, not deletable history rows. */
export async function readLearningProgressStats() {
  const context = captureLearningWriteContext();
  await Promise.all(Array.from(topicWriteQueues.values(), (pending) => pending.catch(() => undefined)));
  const keys = (await Storage.getAllKeys()).filter((key) => key.startsWith(TOPIC_PREFIX));
  const values = await Storage.multiGet(keys);
  assertLearningWriteContext(context);
  let learnedCards = 0;
  let completedCards = 0;
  for (const [, raw] of values) {
    const states = normalizeTopicStates(parseJson<Record<string, Partial<CardLearningState>>>(raw, {}));
    for (const state of Object.values(states)) {
      if (state.visited) learnedCards += 1;
      if (state.completed) completedCards += 1;
    }
  }
  return { learnedCards, completedCards };
}

export function completedCards(cards: QuestionBankCard[], states: Record<string, CardLearningState>) {
  return cards.reduce((count, card) => count + (states[card.id]?.completed ? 1 : 0), 0);
}

export function resetLearningStoreForTests() {
  topicWriteQueues.clear();
  resetLearningRecordStorageForTests();
}
