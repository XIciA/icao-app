/* eslint-disable import/first */
import type { ContentAccessCredential } from '@icao/contracts';
const mockRequest = jest.fn();
const mockSaved = jest.fn();
const mockConnectivity = jest.fn();
jest.mock('../platform/network-service', () => ({ getConnectivity: () => mockConnectivity() }));
let mockAccount = 'a'; let mockGeneration = 0; let mockEnvironment = 'production';
jest.mock('@/platform/api-client', () => ({ ...jest.requireActual('@/platform/api-client'), apiRequest: (...args: unknown[]) => mockRequest(...args) }));
jest.mock('../data/member-content-cache.native', () => ({
  currentQuestionBankContentAccountId: () => mockAccount, questionBankContentAccountGeneration: () => mockGeneration,
  readReusableContentCredential: (...args: unknown[]) => mockSaved(...args),
}));
jest.mock('@/features/native-commercial-testflight/commerce-environment', () => ({ getNativeCommerceEnvironment: () => mockEnvironment, nativeCommerceEnvironmentSnapshot: () => mockEnvironment }));
jest.mock('../data/content-credential-verifier.native', () => ({ verifyContentAccessCredential: ({ credential, scope, accountId, environment }: any) =>
  credential.token === accountId && credential.environment === environment && credential.scopes.some((item: any) => item.topicId === scope.topicId) }));
import { requestContentCredentials } from '../data/content-credential-client.native';
import { ApiClientError } from '@/platform/api-client';
const scopes = (count: number, prefix = 'topic') => Array.from({ length: count }, (_, i) => ({ bankId: 'opi', categoryId: 'category', topicId: `${prefix}-${i}`, version: 30 }));
const credential = (values = scopes(1)): ContentAccessCredential => ({ token: mockAccount, environment: mockEnvironment as 'production', validity: 'membership',
  issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400_000).toISOString(), policyVersion: 'content-access-v2', scopes: values });
beforeEach(() => {
  jest.useFakeTimers(); mockGeneration++; mockAccount = 'a'; mockEnvironment = 'production';
  mockSaved.mockReset().mockResolvedValue(undefined);
  mockConnectivity.mockReset().mockResolvedValue('online');
  mockRequest.mockReset().mockImplementation(async (_url, init) => credential(JSON.parse(init.body).scopes));
});
afterEach(() => jest.useRealTimers());
test('radio, downloads and topic reads share bounded batches and duplicate scopes', async () => {
  const all = scopes(57);
  const bulk = requestContentCredentials(all, { background: true });
  const download = requestContentCredentials(all.slice(0, 24));
  const single = requestContentCredentials([all[0]]);
  await jest.advanceTimersByTimeAsync(25);
  const [result, duplicate, one] = await Promise.all([bulk, download, single]);
  expect(mockRequest).toHaveBeenCalledTimes(3);
  expect(mockRequest.mock.calls.map(([, init]) => JSON.parse(init.body).scopes.length)).toEqual([24, 24, 9]);
  expect(result).toHaveLength(57); expect(duplicate[0]).toBe(one[0]);
});
test('uses a verified stored credential without issuing a new one', async () => {
  const saved = credential(); mockSaved.mockResolvedValue(saved);
  expect(await requestContentCredentials(scopes(1))).toEqual([saved]);
  expect(mockRequest).not.toHaveBeenCalled();
});
test('a shared cooldown stops a background burst and permits a later retry', async () => {
  mockRequest.mockRejectedValueOnce(new ApiClientError('content_credential_rate_limited', 429, undefined, 45));
  const result = requestContentCredentials(scopes(80)).catch(error => error);
  await jest.advanceTimersByTimeAsync(25);
  expect(await result).toMatchObject({ status: 429, retryAfterSeconds: 45 });
  expect(mockRequest).toHaveBeenCalledTimes(1);
  await expect(requestContentCredentials(scopes(1, 'download'))).rejects.toMatchObject({ status: 429 });
  expect(mockRequest).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(45_000);
  const resumed = requestContentCredentials(scopes(1, 'download'));
  await jest.advanceTimersByTimeAsync(25);
  expect(await resumed).toHaveLength(1); expect(mockRequest).toHaveBeenCalledTimes(2);
});
test.each(['account', 'environment', 'generation'])('rejects late credentials after %s changes', async kind => {
  let finish!: (value: unknown) => void;
  const old = credential(); mockRequest.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = requestContentCredentials(scopes(1)).catch(error => error);
  await jest.advanceTimersByTimeAsync(25);
  if (kind === 'account') mockAccount = 'b';
  else if (kind === 'environment') mockEnvironment = 'sandbox';
  else mockGeneration++;
  finish(old);
  expect(await pending).toMatchObject({ code: 'content_account_changed' });
  const fresh = requestContentCredentials(scopes(1)); await jest.advanceTimersByTimeAsync(25);
  expect((await fresh)[0].token).toBe(mockAccount);
  expect(mockRequest).toHaveBeenCalledTimes(2);
});
test('cancelling one consumer does not cancel the same scope needed by another', async () => {
  let valid = true;
  const cancelled = requestContentCredentials(scopes(1), { isCurrent: () => valid }).catch(error => error);
  const live = requestContentCredentials(scopes(1));
  await Promise.resolve(); valid = false;
  await jest.advanceTimersByTimeAsync(25);
  expect(await cancelled).toMatchObject({ code: 'content_request_cancelled' });
  expect(await live).toHaveLength(1); expect(mockRequest).toHaveBeenCalledTimes(1);
});
test('a canceled queued scope does not send a request', async () => {
  let valid = true;
  const cancelled = requestContentCredentials(scopes(1), { isCurrent: () => valid }).catch(error => error);
  await Promise.resolve(); valid = false;
  await jest.advanceTimersByTimeAsync(25);
  expect(await cancelled).toMatchObject({ code: 'content_request_cancelled' });
  expect(mockRequest).not.toHaveBeenCalled();
});
test('explicit download work precedes unsent background scopes', async () => {
  const background = requestContentCredentials(scopes(30), { background: true });
  const download = requestContentCredentials(scopes(2, 'download'));
  await jest.advanceTimersByTimeAsync(25); await Promise.all([background, download]);
  expect(JSON.parse(mockRequest.mock.calls[0][1].body).scopes.slice(0, 2).map((s: any) => s.topicId)).toEqual(['download-0', 'download-1']);
});
test('invalid signatures/scopes are rejected and never reused', async () => {
  mockRequest.mockResolvedValueOnce({ ...credential(), token: 'wrong-account' });
  const invalid = requestContentCredentials(scopes(1)).catch(error => error);
  await jest.advanceTimersByTimeAsync(25); expect((await invalid).message).toBe('invalid_content_credential');
  const retry = requestContentCredentials(scopes(1)); await jest.advanceTimersByTimeAsync(25);
  expect(await retry).toHaveLength(1); expect(mockRequest).toHaveBeenCalledTimes(2);
});


test('concurrent release versions never put a duplicate topic in one API batch', async () => {
  const first = scopes(1)[0];
  const result = requestContentCredentials([first, { ...first, version: 31 }], { forceRefresh: true });
  await jest.advanceTimersByTimeAsync(25);
  expect(await result).toHaveLength(2);
  expect(mockRequest.mock.calls.map(([, init]) => JSON.parse(init.body).scopes.length)).toEqual([1, 1]);
});

test('rechecks shared issuance after a slow persisted-credential read', async () => {
  let finish!: (value: undefined) => void;
  mockSaved.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const slow = requestContentCredentials(scopes(1));
  const other = requestContentCredentials(scopes(1));
  await jest.advanceTimersByTimeAsync(25);
  await other; finish(undefined); await slow;
  expect(mockRequest).toHaveBeenCalledTimes(1);
});


test('offline catalog preparation can reuse local credentials but does not issue new requests', async () => {
  mockConnectivity.mockResolvedValue('offline');
  mockSaved.mockResolvedValueOnce(credential());
  expect(await requestContentCredentials(scopes(1))).toHaveLength(1);
  const missing = requestContentCredentials(scopes(1, 'missing')).catch(error => error);
  await jest.advanceTimersByTimeAsync(25);
  expect(await missing).toMatchObject({ code: 'network_failed' });
  expect(mockRequest).not.toHaveBeenCalled();
});
