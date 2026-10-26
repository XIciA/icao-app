import data from '../data/question-bank-public.json';
import type { QuestionBankDataset } from '../types';
import { loadQuestionBank, questionBankRepository } from '../data/repository.native';
import { cardIdentityKey, resolveCardReferences } from '../data/card-references.native';
import { ApiClientError } from '@/platform/api-client';
jest.mock('../data/repository.native', () => ({ loadQuestionBank: jest.fn(), questionBankRepository: { getTopic: jest.fn() } }));
let mockOwner = 1;
jest.mock('@/features/native-commercial-testflight/commerce-entitlement-events', () => ({ commerceContentAccessSnapshot: () => mockOwner }));
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

it('publishes a ready bank while another bank is still waiting', async () => {
  const slow = deferred<Awaited<ReturnType<typeof loadQuestionBank>>>();
  const other = data[1] as QuestionBankDataset;
  const otherTarget = { bankId: other.id, categoryId: other.categories[0].id,
    topicId: other.categories[0].topics[0].id, cardId: other.categories[0].topics[0].cards[0].id };
  const fastTarget = { ...target, cardId: topic.cards[0].id };
  load.mockImplementation(async id => id === bank.id ? slow.promise : { source: 'remote', dataset: other });
  const published = deferred<Map<string, import('../data/card-references.native').CardReference>>();
  const result = resolveCardReferences([fastTarget, otherTarget], { onProgress: values => {
    if (values.has(cardIdentityKey(otherTarget))) published.resolve(values);
  } });
  const partial = await published.promise;
  expect(partial.get(cardIdentityKey(otherTarget))?.status).toBe('ready');
  expect(partial.has(cardIdentityKey(fastTarget))).toBe(false);
  slow.resolve({ source: 'remote', dataset: bank });
  expect((await result).get(cardIdentityKey(fastTarget))?.status).toBe('ready');
  expect(partial.has(cardIdentityKey(fastTarget))).toBe(false);
});

it('limits requests globally and stops queued work after cancellation', async () => {
  const releases = data.map(() => deferred<Awaited<ReturnType<typeof loadQuestionBank>>>());
  load.mockImplementation(id => releases[data.findIndex(item => item.id === id)].promise);
  const targets = data.map(item => ({ bankId: item.id as QuestionBankDataset['id'],
    categoryId: item.categories[0].id, topicId: item.categories[0].topics[0].id, cardId: 'unknown' }));
  let current = true;
  const progress = jest.fn();
  const result = resolveCardReferences(targets, { onProgress: progress, isCurrent: () => current });
  const rejected = expect(result).rejects.toThrow('content_request_cancelled');
  expect(load).toHaveBeenCalledTimes(4);
  current = false;
  releases.forEach((pending, index) => pending.resolve({ source: 'remote', dataset: data[index] as QuestionBankDataset }));
  await rejected;
  expect(load).toHaveBeenCalledTimes(4);
  expect(progress).not.toHaveBeenCalled();
});
