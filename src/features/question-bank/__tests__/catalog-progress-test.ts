import { loadCatalogProgress } from '../lib/catalog-progress';
import { sqliteLearningStore } from '../platform/learning-store';
import type { QuestionBankTopic } from '../types';
jest.mock('../platform/learning-store', () => ({ sqliteLearningStore: { getTopicStates: jest.fn() } }));

it('counts protected learned cards by scope IDs without needing their protected text', async () => {
  jest.mocked(sqliteLearningStore.getTopicStates).mockResolvedValue({ a: { completed: true }, b: { completed: true }, c: { completed: false } } as never);
  const topic: QuestionBankTopic = { id: 'topic', name: 'topic', cards: [], declaredCardCount: 2, scopeCardIds: { all: ['a', 'b', 'c'], selected: ['b', 'c'], crash: ['c'] } };
  expect(await loadCatalogProgress([topic], 'selected')).toEqual({ topic: { learned: 1, total: 2 } });
  expect(await loadCatalogProgress([{ ...topic, declaredCardCount: 3 }], 'all')).toEqual({ topic: { learned: 2, total: 3 } });
});
