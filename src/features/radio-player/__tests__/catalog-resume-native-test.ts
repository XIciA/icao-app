/* eslint-disable import/first */
import type { QuestionBankDataset } from '@/features/question-bank/types';
const mockLoad = jest.fn();
const mockGetTopic = jest.fn();
const mockEmbedded = [{ id: 'opi', enabled: true, categories: [] }];
jest.mock('@/features/question-bank/data/repository.native', () => ({
  getEmbeddedQuestionBanks: () => mockEmbedded,
  loadQuestionBank: (...args: unknown[]) => mockLoad(...args),
  questionBankRepository: { getTopic: (...args: unknown[]) => mockGetTopic(...args) },
}));
jest.mock('@/features/native-commercial-testflight/commerce-environment.native', () => ({
  getNativeCommerceEnvironmentState: () => ({ accountId: 'member', generation: 1 }),
}));
import { loadRadioCatalogDatasets, deriveRadioCatalogs } from '../catalog.native';

const release = { bankId: 'opi', version: 1, checksum: 'a'.repeat(64) };
const card = { id: 'question', taskTitle: 'Question', audioText: 'Question', audio: '/audio/question.mp3' };
const topic = { id: 'topic', name: 'Topic', declaredCardCount: 1, cards: [], access: { level: 'member', declaredCardCount: 1, availableCardCount: 0 } };
const bank = {
  id: 'opi', enabled: true, declaredCardCount: 1, contentRelease: release,
  access: { membershipActive: true },
  categories: [{ id: 'category', topics: [topic] }],
} as unknown as QuestionBankDataset;
const previous = [{ ...bank, categories: [{ ...bank.categories[0], topics: [{ ...bank.categories[0].topics[0], cards: [card] }] }] }];

beforeEach(() => {
  mockLoad.mockReset().mockResolvedValue({ dataset: bank });
  mockGetTopic.mockReset().mockResolvedValue({ ...topic, cards: [card] });
});
it('resumes same-release progress without re-requesting completed protected topics', async () => {
  const result = await loadRadioCatalogDatasets(undefined, { complete: true, previousDatasets: previous });
  expect(mockGetTopic).not.toHaveBeenCalled();
  expect(deriveRadioCatalogs(result)[0].complete).toBe(true);
  expect(deriveRadioCatalogs(result)[0].tracks.map(track => track.id)).toEqual(['question']);
});
it('fetches fresh topics when the content release changes', async () => {
  mockLoad.mockResolvedValue({ dataset: { ...bank, contentRelease: { ...release, version: 2 } } });
  await loadRadioCatalogDatasets(undefined, { complete: true, previousDatasets: previous });
  expect(mockGetTopic).toHaveBeenCalledTimes(1);
});
it('does not reuse protected cards after membership is revoked', async () => {
  mockLoad.mockResolvedValue({ dataset: { ...bank, access: { membershipActive: false } } });
  const result = await loadRadioCatalogDatasets(undefined, { complete: true, previousDatasets: previous });
  expect(mockGetTopic).not.toHaveBeenCalled();
  expect(result[0].categories[0].topics[0].cards).toEqual([]);
});
