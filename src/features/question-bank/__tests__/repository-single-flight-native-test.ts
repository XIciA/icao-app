import { apiFetch, apiRequest, ApiClientError } from '@/platform/api-client';
import { loadQuestionBank, remoteQuestionBankRepository } from '../data/repository.native';
import type { QuestionBankDataset } from '../types';
import data from '../data/question-bank-public.json';

let mockAccount = 'account-a', mockGeneration = 1, mockEnvironment = 'production', mockAccess = 'member-a';
let mockBase = 'https://test.invalid';
jest.mock('@/platform/api-client', () => ({ ...jest.requireActual('@/platform/api-client'),
  getApiBaseUrl: () => mockBase, apiFetch: jest.fn(), apiRequest: jest.fn(), apiAccessToken: jest.fn(async () => undefined) }));
jest.mock('@/platform/storage', () => ({ __esModule: true, default: {
  getAllKeys: jest.fn(async () => []), multiRemove: jest.fn(), getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined),
} }));
jest.mock('../data/member-content-cache', () => ({
  currentQuestionBankContentAccountId: () => mockAccount, questionBankContentAccountGeneration: () => mockGeneration,
  clearQuestionBankMemberContent: jest.fn(async () => undefined), readMemberTopicCache: jest.fn(async () => undefined), writeMemberTopicCache: jest.fn(),
}));
jest.mock('@/features/native-commercial-testflight/commerce-environment', () => ({
  getNativeCommerceEnvironment: () => mockEnvironment, nativeCommerceEnvironmentSnapshot: () => `${mockAccount}:${mockEnvironment}:${mockGeneration}`,
}));
jest.mock('@/features/native-commercial-testflight/commerce-entitlement-events', () => ({ commerceContentAccessSnapshot: () => mockAccess }));
const bank = data[0] as QuestionBankDataset;
const category = bank.categories[0], topic = category.topics[0];
const release = { bankId: bank.id, version: 3, checksum: 'a'.repeat(64) };
const catalogResponse = () => ({ ok: true, status: 200, json: async () => ({ data: { ...release, dataset: bank } }) }) as Response;
const topicResponse = (version = 3, checksum = release.checksum) => ({ ...release, version, checksum, categoryId: category.id,
  access: { membershipActive: false }, topic });
const fetchMock = jest.mocked(apiFetch), requestMock = jest.mocked(apiRequest);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function flush() { for (let i = 0; i < 15; i++) await Promise.resolve(); }
beforeEach(() => {
  jest.clearAllMocks(); mockAccount = 'account-a'; mockGeneration = 1; mockEnvironment = 'production'; mockAccess = 'member-a'; mockBase = 'https://test.invalid';
  fetchMock.mockResolvedValue(catalogResponse()); requestMock.mockResolvedValue(topicResponse());
});

it('coalesces overlapping catalogs, gives callers independent payloads, and revalidates after settlement', async () => {
  const gate = deferred<Response>(); fetchMock.mockReturnValue(gate.promise);
  const first = remoteQuestionBankRepository.getDataset(bank.id), second = remoteQuestionBankRepository.getDataset(bank.id);
  await flush(); expect(fetchMock).toHaveBeenCalledTimes(1);
  gate.resolve(catalogResponse());
  const [a, b] = await Promise.all([first, second]);
  a!.categories[0].topics[0].cards[0].taskTitle = 'caller projection';
  expect(b!.categories[0].topics[0].cards[0].taskTitle).not.toBe('caller projection');
  await remoteQuestionBankRepository.getDataset(bank.id);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('coalesces topic requests only for the same complete version identity', async () => {
  const gate = deferred<ReturnType<typeof topicResponse>>(); requestMock.mockReturnValue(gate.promise);
  const first = remoteQuestionBankRepository.getTopic(bank.id, category.id, topic.id, release);
  const second = remoteQuestionBankRepository.getTopic(bank.id, category.id, topic.id, { ...release });
  await flush(); expect(requestMock).toHaveBeenCalledTimes(1);
  requestMock.mockResolvedValue(topicResponse(4, 'b'.repeat(64)));
  await remoteQuestionBankRepository.getTopic(bank.id, category.id, topic.id, { ...release, version: 4, checksum: 'b'.repeat(64) });
  expect(requestMock).toHaveBeenCalledTimes(2);
  gate.resolve(topicResponse());
  const [a, b] = await Promise.all([first, second]);
  expect(a).toEqual(b); expect(a).not.toBe(b);
});

it.each(['account', 'generation', 'environment', 'access', 'base'])('does not share across %s changes or return the stale catalog', async change => {
  const gate = deferred<Response>(); fetchMock.mockReturnValueOnce(gate.promise);
  const first = loadQuestionBank(bank.id);
  const rejected = expect(first).rejects.toMatchObject({ code: 'content_account_changed' });
  await flush(); expect(fetchMock).toHaveBeenCalledTimes(1);
  if (change === 'account') mockAccount = 'account-b';
  if (change === 'generation') mockGeneration++;
  if (change === 'environment') mockEnvironment = 'sandbox';
  if (change === 'access') mockAccess = 'free';
  if (change === 'base') mockBase = 'https://other.invalid';
  const second = remoteQuestionBankRepository.getDataset(bank.id);
  await second; expect(fetchMock).toHaveBeenCalledTimes(2);
  gate.resolve(catalogResponse()); await rejected;
});

it('clears failed work so a later retry can succeed without suppressing authorization errors', async () => {
  let reject!: (reason: unknown) => void;
  requestMock.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
  const first = remoteQuestionBankRepository.getTopic(bank.id, category.id, topic.id, release);
  const second = remoteQuestionBankRepository.getTopic(bank.id, category.id, topic.id, release);
  const results = Promise.allSettled([first, second]);
  await flush(); expect(requestMock).toHaveBeenCalledTimes(1);
  reject(new ApiClientError('membership_required', 403));
  expect((await results).every(value => value.status === 'rejected' && value.reason.code === 'membership_required')).toBe(true);
  await remoteQuestionBankRepository.getTopic(bank.id, category.id, topic.id, release);
  expect(requestMock).toHaveBeenCalledTimes(2);
});

it('keeps a caller-owned abort separate from another screen request', async () => {
  const controller = new AbortController();
  const gate = deferred<Response>(); fetchMock.mockImplementation((_path, init) => init?.signal
    ? new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) : gate.promise);
  const isolated = remoteQuestionBankRepository.getDataset(bank.id, controller.signal);
  const rejected = expect(isolated).rejects.toThrow('aborted');
  const shared = remoteQuestionBankRepository.getDataset(bank.id);
  await flush(); expect(fetchMock).toHaveBeenCalledTimes(2);
  controller.abort(); gate.resolve(catalogResponse());
  await rejected; expect((await shared)?.id).toBe(bank.id);
});
