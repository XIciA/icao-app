import data from '../data/question-bank-public.json';
import type { QuestionBankDataset } from '../types';
import { loadQuestionBank, questionBankRepository } from '../data/repository.native';
import { cardIdentityKey, resolveCardReferences } from '../data/card-references.native';
import { ApiClientError } from '@/platform/api-client';
jest.mock('../data/repository.native', () => ({ loadQuestionBank: jest.fn(), questionBankRepository: { getTopic: jest.fn() } }));
let mockOwner = 1;
jest.mock('@/features/native-commercial-testflight/commerce-entitlement-events', () => ({ commerceEntitlementSnapshotVersion: () => mockOwner }));
jest.mock('@/features/native-commercial-testflight/commerce-environment.native', () => ({ nativeCommerceEnvironmentSnapshot: () => 'production' }));
const bank = data[0] as QuestionBankDataset;
const category = bank.categories[0], topic = category.topics[0];
const missingId = topic.scopeCardIds!.all.find(id => !topic.cards.some(card => card.id === id))!;
const target = { bankId: bank.id, categoryId: category.id, topicId: topic.id, cardId: missingId };
const load = jest.mocked(loadQuestionBank), getTopic = jest.mocked(questionBankRepository.getTopic);
beforeEach(() => { jest.clearAllMocks(); mockOwner = 1; load.mockResolvedValue({ source: 'remote', dataset: { ...bank, access: { ...bank.access!, membershipActive: true } } }); });
it('hydrates member text omitted from the embedded directory and groups topic requests', async () => {
  const card = { id: missingId, taskTitle: 'Member', audioText: 'Member question' };
  getTopic.mockResolvedValue({ ...topic, cards: [card] });
  const result = await resolveCardReferences([target, target]);
  expect(result.get(cardIdentityKey(target))).toMatchObject({ status: 'ready', location: { card } });
  expect(getTopic).toHaveBeenCalledTimes(1);
});
it('does not claim deletion when the directory request falls back', async () => {
  load.mockResolvedValue({ dataset: bank, source: 'embedded', warning: 'offline' });
  const unknown = { ...target, cardId: 'new-online-card' };
  expect((await resolveCardReferences([unknown])).get(cardIdentityKey(unknown))?.status).toBe('unavailable');
});
it('separates authorization from missing content', async () => {
  getTopic.mockRejectedValue(new ApiClientError('membership_required', 403));
  expect((await resolveCardReferences([target])).get(cardIdentityKey(target))?.status).toBe('membership-required');
});
it('rejects a late response after account ownership changes', async () => {
  getTopic.mockImplementation(async () => { mockOwner++; return topic; });
  await expect(resolveCardReferences([target])).rejects.toThrow('content_account_changed');
});
