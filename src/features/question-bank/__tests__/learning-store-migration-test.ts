import Storage from 'expo-sqlite/kv-store';

import { resetLearningStoreForTests, sqliteLearningStore } from '../platform/learning-store';
import type { QuestionBankTopic } from '../types';

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
});
