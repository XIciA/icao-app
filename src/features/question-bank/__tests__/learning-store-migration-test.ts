import Storage from 'expo-sqlite/kv-store';

import { resetLearningStoreForTests, sqliteLearningStore } from '../platform/learning-store';
import { getLearningRecords, upsertLearningRecord } from '../platform/learning-record-storage';
import type { LearningRecord, QuestionBankTopic } from '../types';

let mockLegacyReadGate: Promise<void> | undefined;

jest.mock('expo-sqlite/kv-store', () => {
  const values = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      clear: jest.fn(async () => values.clear()),
      getItem: jest.fn(async (key: string) => {
        if (key.startsWith('icao.learning.v1.topic.') && mockLegacyReadGate) await mockLegacyReadGate;
        return values.get(key) ?? null;
      }),
      setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    },
  };
});

const topic: QuestionBankTopic = {
  id: 'migration-topic', name: 'Migration', declaredCardCount: 2,
  cards: [
    { id: 'legacy', taskTitle: 'Legacy', audioText: 'Legacy' },
    { id: 'current', taskTitle: 'Current', audioText: 'Current' },
  ],
};

function learningRecord(id: string, transcript: string): LearningRecord {
  return {
    schemaVersion: 3,
    id,
    sessionId: 'study-session',
    cardId: 'card-1',
    bankId: 'opi',
    bankTitle: 'OPI',
    categoryTitle: '运行',
    topicTitle: '燃油',
    completedCount: 1,
    totalCount: 1,
    correctCount: 0,
    durationSeconds: 5,
    reason: 'complete',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:01.000Z',
    recordType: 'ai_result',
    aiResult: { questionId: 'card-1', transcript },
  };
}

describe('learning store migration', () => {
  beforeEach(async () => {
    mockLegacyReadGate = undefined;
    await Storage.clear();
    resetLearningStoreForTests();
  });

  it('merges partial v2 data over v1 and leaves the legacy key untouched', async () => {
    const legacyKey = 'icao.learning.v1.topic.migration-topic';
    const currentKey = 'icao.learning.v2.topic.migration-topic';
    await Storage.setItem(legacyKey, JSON.stringify({
      legacy: { visited: true, note: '', updatedAt: '2026-07-10T00:00:00.000Z' },
      current: { visited: true, recorded: true, note: '', updatedAt: '2026-07-10T00:00:00.000Z' },
    }));
    await Storage.setItem(currentKey, JSON.stringify({
      current: { visited: true, completed: false, note: 'newer', updatedAt: '2026-07-12T00:00:00.000Z' },
    }));

    const migrated = await sqliteLearningStore.getTopicStates(topic);
    expect(migrated.legacy.completed).toBe(false);
    expect(migrated.current).toMatchObject({ completed: false, note: 'newer' });
    expect(await Storage.getItem(legacyKey)).not.toBeNull();
    expect(JSON.parse((await Storage.getItem(currentKey)) ?? '{}')).toHaveProperty('legacy');
    expect(await Storage.getItem('icao.learning.v2.migrated.migration-topic')).toBe('1');
  });

  it('serializes a concurrent v2 save behind migration without losing either state', async () => {
    const legacyKey = 'icao.learning.v1.topic.migration-topic';
    const currentKey = 'icao.learning.v2.topic.migration-topic';
    await Storage.setItem(legacyKey, JSON.stringify({
      legacy: { visited: true, recorded: true, note: '', updatedAt: '2026-07-10T00:00:00.000Z' },
    }));
    let releaseLegacyRead!: () => void;
    mockLegacyReadGate = new Promise<void>((resolve) => { releaseLegacyRead = resolve; });

    const migration = sqliteLearningStore.getTopicStates(topic);
    const save = sqliteLearningStore.saveCardState('migration-topic', 'current', {
      visited: true,
      completed: true,
      note: 'saved while migrating',
      updatedAt: '2026-07-12T00:00:00.000Z',
    });
    releaseLegacyRead();
    await Promise.all([migration, save]);

    const stored = JSON.parse((await Storage.getItem(currentKey)) ?? '{}');
    expect(stored.legacy).toMatchObject({ completed: true, recorded: true });
    expect(stored.current).toMatchObject({ completed: true, note: 'saved while migrating' });
  });

  it('serializes learning-record upserts and keeps only the latest value for one stable id', async () => {
    await Promise.all([
      upsertLearningRecord(learningRecord('answer-1', 'first')),
      upsertLearningRecord(learningRecord('answer-1', 'latest')),
    ]);

    expect(await getLearningRecords()).toEqual([
      expect.objectContaining({ id: 'answer-1', aiResult: expect.objectContaining({ transcript: 'latest' }) }),
    ]);
  });

  it('keeps the same card from different study sessions as separate history records', async () => {
    await upsertLearningRecord(learningRecord('session-a-card-1', 'first session'));
    await upsertLearningRecord({ ...learningRecord('session-b-card-1', 'second session'), sessionId: 'study-session-b' });

    expect((await getLearningRecords()).map((record) => record.id)).toEqual(['session-b-card-1', 'session-a-card-1']);
  });

  it('keeps session summaries when the separate AI-result limit is reached', async () => {
    await upsertLearningRecord({ ...learningRecord('session-summary', 'session'), recordType: 'session' });
    await Promise.all(Array.from({ length: 101 }, (_, index) => upsertLearningRecord(learningRecord(`answer-${index}`, `${index}`))));

    const records = await getLearningRecords();
    expect(records.filter((record) => record.recordType === 'ai_result')).toHaveLength(100);
    expect(records).toContainEqual(expect.objectContaining({ id: 'session-summary', recordType: 'session' }));
  });
});
