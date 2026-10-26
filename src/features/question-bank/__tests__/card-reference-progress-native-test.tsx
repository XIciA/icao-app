import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCardReferences } from '../annotations/use-card-references.native';
import { loadQuestionBank, questionBankRepository } from '../data/repository.native';
import { beginCommerceEntitlementGeneration, publishCommerceEntitlementChange, resetCommerceEntitlementEventsForTests } from '@/features/native-commercial-testflight/commerce-entitlement-events';
import data from '../data/question-bank-public.json';
import type { QuestionBankDataset } from '../types';

jest.mock('../data/repository.native', () => ({ loadQuestionBank: jest.fn(), questionBankRepository: { getTopic: jest.fn() } }));
jest.mock('@/features/native-commercial-testflight/commerce-environment.native', () => ({ nativeCommerceEnvironmentSnapshot: () => 'production', subscribeNativeCommerceEnvironment: () => () => undefined }));
const bank = data[0] as QuestionBankDataset;
const category = bank.categories[0], topic = category.topics[0];
const target = { bankId: bank.id, categoryId: category.id, topicId: topic.id, cardId: topic.cards[0].id };
const missingId = topic.scopeCardIds!.all.find(id => !topic.cards.some(card => card.id === id))!;
const pendingTarget = { ...target, cardId: missingId };
const load = jest.mocked(loadQuestionBank), getTopic = jest.mocked(questionBankRepository.getTopic);
beforeEach(() => {
  jest.resetAllMocks(); resetCommerceEntitlementEventsForTests();
  load.mockResolvedValue({ source: 'remote', dataset: { ...bank, access: { ...bank.access!, membershipActive: true } } });
});

it('renders available references before the remaining topic finishes', async () => {
  let finish!: (value: typeof topic) => void;
  getTopic.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const hook = await renderHook(() => useCardReferences([target, pendingTarget]));
  await waitFor(() => expect(hook.result.current.values?.get(`${bank.id}:${target.cardId}`)?.status).toBe('ready'));
  expect(hook.result.current.values?.has(`${bank.id}:${missingId}`)).toBe(false);
  await act(async () => finish({ ...topic, cards: [{ ...topic.cards[0], id: missingId }] }));
  expect(hook.result.current.values?.get(`${bank.id}:${missingId}`)?.status).toBe('ready');
});

it('does not restart content for unchanged membership, but reloads when access changes', async () => {
  const owner = beginCommerceEntitlementGeneration('one');
  const snapshot = { serverTime: '2026-10-26T00:00:00Z', membership: { active: true, expiresAt: '2099-01-01' } };
  publishCommerceEntitlementChange({ ...owner, snapshot: snapshot as never });
  const hook = await renderHook(() => useCardReferences([target]));
  await waitFor(() => expect(hook.result.current.values?.size).toBe(1));
  await act(async () => { publishCommerceEntitlementChange({ ...owner, snapshot: { ...snapshot, serverTime: '2026-10-26T00:01:00Z' } as never }); });
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => { publishCommerceEntitlementChange({ ...owner, snapshot: { ...snapshot, serverTime: '2026-10-26T00:02:00Z', membership: { active: false } } as never }); });
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
});
