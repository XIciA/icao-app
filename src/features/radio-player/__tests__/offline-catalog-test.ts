import { offlineRadioDatasets } from '../offline-catalog.native';
import type { QuestionBankDataset } from '@/features/question-bank/types';
const mockCache = jest.fn();
const mockPrepared = jest.fn();
const mockAccess = jest.fn(async () => 'missing');
const mockPackage = { target: { topics: [{ categoryId: 'c', topicId: 't', cardIds: ['a', 'b', 'c'] }], resources: [{ publicPath: '/a', checksum: 'new', sizeBytes: 1 }, { publicPath: '/b', checksum: 'b', sizeBytes: 1 }] } };
jest.mock('@/features/question-bank/data/member-content-cache.native', () => ({ inspectOfflineMemberTopicAccess: () => mockAccess(), currentQuestionBankContentAccountId: () => 'a', readMemberTopicCache: (...args: unknown[]) => mockCache(...args), offlineResourcePrepared: (...args: unknown[]) => mockPrepared(...args) }));
jest.mock('@/features/question-bank/downloads/download-manager.native', () => ({ prepareDownloads: async () => undefined, downloadSnapshot: () => ({ listening: mockPackage }) }));
const bank = { id: 'listening', categories: [{ id: 'c', topics: [{ id: 't', cards: [], access: { level: 'member', declaredCardCount: 4 } }] }] } as unknown as QuestionBankDataset;
it('uses only current-account downloaded words with an available audio; invalid or missing files do not enter the queue', async () => {
  mockCache.mockResolvedValue({ cards: [{ id: 'a', audio: '/a' }, { id: 'b', audio: '/b' }, { id: 'c', audio: '/missing' }, { id: 'not-selected', audio: '/a' }] });
  mockPrepared.mockImplementation(async path => path === '/a');
  const [result] = await offlineRadioDatasets([bank], () => undefined);
  expect(result!.categories[0]!.topics[0]!.cards.map(card => card.id)).toEqual(['a']);
  expect(result!.offlineProjection).toBe(true);
  expect(result!.categories[0]!.topics[0]!.radioEntries).toBeUndefined();
});
it('expired authorization requests verification instead of claiming there is no download', async () => {
  mockCache.mockResolvedValue(undefined);
  mockAccess.mockResolvedValue('expired');
  await expect(offlineRadioDatasets([bank], () => undefined)).rejects.toMatchObject({ code: 'offline_authorization_required' });
});
