import { loadStudyCatalogProgress } from '../lib/study-catalog-progress';
import { readTopicStatesBatch } from '../platform/learning-store.native';
import type { QuestionBankDataset, QuestionBankId } from '../types';
jest.mock('../platform/learning-store.native', () => ({ readTopicStatesBatch: jest.fn() }));
function dataset(id: QuestionBankId, total = 2): QuestionBankDataset {
  return { id, declaredCardCount: total, categories: [{ topics: [{ id, cards: [], declaredCardCount: total, scopeCardIds: { all: ['a', 'b', 'c'], selected: ['a', 'c'], crash: [] } }] }] } as unknown as QuestionBankDataset;
}
it('uses protected scope IDs, deduplicates IDs, excludes browsing, and treats 900 sentences as all-scope', async () => {
  jest.mocked(readTopicStatesBatch).mockResolvedValue({
    listening: { a: { completed: true }, b: { completed: true }, c: { visited: true, completed: false } },
    sentences900: { a: { completed: true }, b: { completed: true }, c: { completed: false } },
  } as never);
  expect(await loadStudyCatalogProgress([dataset('listening'), dataset('sentences900', 3)], 'selected')).toEqual({ listening: 1, sentences900: 2 });
  expect(await loadStudyCatalogProgress([dataset('listening', 3)], 'all')).toEqual({ listening: 2 });
});
it('propagates unreadable progress rather than turning it into zero', async () => {
  jest.mocked(readTopicStatesBatch).mockRejectedValueOnce(new Error('learning_state_invalid'));
  await expect(loadStudyCatalogProgress([dataset('opi')], 'all')).rejects.toThrow('learning_state_invalid');
});
it('never counts retired, duplicated, or out-of-directory cards', async () => {
  const bank = dataset('opi'); const topic = bank.categories[0].topics[0];
  topic.cards = [{ id: 'b', retired: true }] as never;
  topic.scopeCardIds!.all = ['a', 'a', 'b', 'c'];
  jest.mocked(readTopicStatesBatch).mockResolvedValue({ opi: { a: { completed: true }, b: { completed: true }, c: { completed: false }, old: { completed: true } } } as never);
  expect(await loadStudyCatalogProgress([bank], 'all')).toEqual({ opi: 1 });
});
