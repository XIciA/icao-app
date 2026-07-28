import Storage from '@/platform/storage';

import { enqueueCardState, enqueueLearningRecord } from '@/features/sync/learning-sync';

import type { CardLearningState, LearningRecord, QuestionBankCard, QuestionBankTopic } from '../types';
import { getLearningRecords, resetLearningRecordStorageForTests, upsertLearningRecord } from './learning-record-storage';

const LEGACY_TOPIC_PREFIX = 'icao.learning.v1.topic.';
const TOPIC_PREFIX = 'icao.learning.v2.topic.';
const MIGRATION_PREFIX = 'icao.learning.v2.migrated.';
const topicWriteQueues = new Map<string, Promise<void>>();

export type LearningStore = {
  getCardState(topicId: string, cardId: string): Promise<CardLearningState | undefined>;
  saveCardState(topicId: string, cardId: string, state: CardLearningState): Promise<void>;
  getTopicStates(topic: QuestionBankTopic): Promise<Record<string, CardLearningState>>;
  addRecord(record: LearningRecord): Promise<void>;
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

  if (writes.length > 0) await Storage.multiSet(writes);
  return statesByTopic;
}

export const sqliteLearningStore: LearningStore = {
  async getCardState(topicId, cardId) {
    const states = await readTopicStates(topicId);
    return states[cardId];
  },
  async saveCardState(topicId, cardId, state) {
    const key = `${TOPIC_PREFIX}${topicId}`;
    const previousWrite = topicWriteQueues.get(key) ?? Promise.resolve();
    const nextWrite = previousWrite
      .catch(() => undefined)
      .then(async () => {
        const states = normalizeTopicStates(
          parseJson<Record<string, Partial<CardLearningState>>>(await Storage.getItem(key), {}),
        );
        const normalized = migrateLegacyCardState(state);
        await Storage.setItem(key, JSON.stringify({ ...states, [cardId]: normalized }));
        await enqueueCardState(topicId, cardId, normalized);
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
  async addRecord(record) {
    await upsertLearningRecord(record);
    await enqueueLearningRecord(record);
  },
  async getRecords() {
    return getLearningRecords();
  },
};

export function completedCards(cards: QuestionBankCard[], states: Record<string, CardLearningState>) {
  return cards.reduce((count, card) => count + (states[card.id]?.completed ? 1 : 0), 0);
}

export function resetLearningStoreForTests() {
  topicWriteQueues.clear();
  resetLearningRecordStorageForTests();
}
