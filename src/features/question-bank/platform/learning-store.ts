import Storage from 'expo-sqlite/kv-store';

import type { CardLearningState, LearningRecord, QuestionBankCard, QuestionBankTopic } from '../types';

const TOPIC_PREFIX = 'icao.learning.v1.topic.';
const RECORDS_KEY = 'icao.learning.v1.records';
const MAX_RECORDS = 100;
const topicWriteQueues = new Map<string, Promise<void>>();

async function waitForTopicWrites(key: string) {
  await topicWriteQueues.get(key)?.catch(() => undefined);
}

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

export const sqliteLearningStore: LearningStore = {
  async getCardState(topicId, cardId) {
    const key = `${TOPIC_PREFIX}${topicId}`;
    await waitForTopicWrites(key);
    const states = parseJson<Record<string, CardLearningState>>(
      await Storage.getItem(key),
      {},
    );
    return states[cardId];
  },
  async saveCardState(topicId, cardId, state) {
    const key = `${TOPIC_PREFIX}${topicId}`;
    const previousWrite = topicWriteQueues.get(key) ?? Promise.resolve();
    const nextWrite = previousWrite
      .catch(() => undefined)
      .then(async () => {
        const states = parseJson<Record<string, CardLearningState>>(await Storage.getItem(key), {});
        await Storage.setItem(key, JSON.stringify({ ...states, [cardId]: state }));
      });

    topicWriteQueues.set(key, nextWrite);
    try {
      await nextWrite;
    } finally {
      if (topicWriteQueues.get(key) === nextWrite) topicWriteQueues.delete(key);
    }
  },
  async getTopicStates(topic) {
    const key = `${TOPIC_PREFIX}${topic.id}`;
    await waitForTopicWrites(key);
    return parseJson<Record<string, CardLearningState>>(
      await Storage.getItem(key),
      {},
    );
  },
  async addRecord(record) {
    const current = await this.getRecords();
    await Storage.setItem(RECORDS_KEY, JSON.stringify([record, ...current].slice(0, MAX_RECORDS)));
  },
  async getRecords() {
    return parseJson<LearningRecord[]>(await Storage.getItem(RECORDS_KEY), []);
  },
};

export function completedCards(cards: QuestionBankCard[], states: Record<string, CardLearningState>) {
  return cards.reduce((count, card) => count + (states[card.id]?.visited ? 1 : 0), 0);
}
