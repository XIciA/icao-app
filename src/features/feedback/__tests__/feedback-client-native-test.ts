import { submitFeedback, type SubmitFeedbackInput } from '../feedback-client.native';

let mockOwner = { accountId: 'account-a', generation: 1, status: 'active' };
let mockToken = 'token-a';
const mockListeners = new Set<() => void>();
const mockUpload = jest.fn();
const mockPrepare = jest.fn();
const mockClearDiagnostics = jest.fn();
const mockDiagnostics = jest.fn();
jest.mock('expo-device', () => ({ osName: 'iOS', osVersion: '19.0' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { nativeBuildVersion: '42' } }));
jest.mock('@/features/native-commercial-testflight/commerce-environment.native', () => ({
  getNativeCommerceEnvironmentState: () => mockOwner,
  subscribeNativeCommerceEnvironment: (listener: () => void) => { mockListeners.add(listener); return () => mockListeners.delete(listener); },
}));
jest.mock('@/platform/feedback-upload', () => ({ createFeedbackUploadForm: (...args: unknown[]) => mockPrepare(...args) }));
jest.mock('@/platform/diagnostics/safe-diagnostic-store', () => ({
  getSafeDiagnosticBundleForCorrelation: (...args: unknown[]) => mockDiagnostics(...args),
  clearSafeDiagnosticCorrelation: (...args: unknown[]) => mockClearDiagnostics(...args),
}));
jest.mock('@/platform/api-client', () => ({ ...jest.requireActual('@/platform/api-client'),
  getApiBaseUrl: () => 'https://api.example.test', apiAccessToken: async () => mockToken,
}));
const input: SubmitFeedbackInput = { clientSubmissionId: '00000000-0000-4000-8000-000000000001', category: 'content_correction', description: '这道题目需要修正', source: 'study', sourceRoute: '/question-bank/opi/study/category/topic', images: [], question: { bankId: 'opi', categoryId: 'category', topicId: 'topic', cardId: 'card', bankVersion: 13, bankChecksum: 'a'.repeat(64) } };
const response = () => new Response(JSON.stringify({ data: { ticketNumber: 'FB-123', status: 'received' } }), { status: 200 });

beforeEach(() => {
  jest.clearAllMocks(); mockOwner = { accountId: 'account-a', generation: 1, status: 'active' }; mockToken = 'token-a'; mockListeners.clear();
  mockPrepare.mockImplementation(async (payload: string) => ({ fetch: mockUpload, form: payload }));
  mockUpload.mockResolvedValue(response()); mockDiagnostics.mockResolvedValue(undefined);
});
afterEach(() => jest.useRealTimers());

it('retains the original question version, idempotency key and account token on the single upload path', async () => {
  await expect(submitFeedback(input)).resolves.toMatchObject({ ticketNumber: 'FB-123' });
  const [url, options] = mockUpload.mock.calls[0];
  expect(url).toBe('https://api.example.test/v1/feedback');
  expect(options.headers.authorization).toBe('Bearer token-a');
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(options.body)).toMatchObject({ clientSubmissionId: input.clientSubmissionId, question: input.question });
  expect(mockListeners.size).toBe(0);
});

it('never retries a rejected mutation with a newly selected account token', async () => {
  mockUpload.mockImplementationOnce(async () => {
    mockToken = 'token-b';
    return new Response(JSON.stringify({ error: { code: 'invalid_bearer_token' } }), { status: 401 });
  });
  await expect(submitFeedback(input)).rejects.toThrow('invalid_bearer_token');
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(mockUpload.mock.calls[0][1].headers.authorization).toBe('Bearer token-a');
});

it('does not upload when an account changes while files are prepared', async () => {
  mockPrepare.mockImplementationOnce(async () => {
    mockOwner = { accountId: 'account-b', generation: 2, status: 'active' };
    for (const listener of mockListeners) listener();
    return { fetch: mockUpload, form: 'form' };
  });
  await expect(submitFeedback(input)).rejects.toThrow('request_aborted');
  expect(mockUpload).not.toHaveBeenCalled();
});

it('rejects a late success after account replacement without clearing diagnostics', async () => {
  mockDiagnostics.mockResolvedValue({ feature: 'ai', correlationId: 'A-123', events: [] });
  mockUpload.mockImplementationOnce(async () => {
    mockOwner = { accountId: 'account-b', generation: 2, status: 'active' };
    for (const listener of mockListeners) listener();
    return response();
  });
  await expect(submitFeedback({ ...input, diagnosticFeature: 'ai', diagnosticCorrelationId: 'A-123' })).rejects.toThrow('request_aborted');
  expect(mockClearDiagnostics).not.toHaveBeenCalled();
});

it('aborts a stalled upload at the existing timeout and permits explicit retry with the same key', async () => {
  jest.useFakeTimers();
  mockUpload.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
  const request = submitFeedback(input);
  const rejection = expect(request).rejects.toThrow('ai_timeout');
  await jest.advanceTimersByTimeAsync(45_000);
  await rejection;
  jest.useRealTimers();
  await expect(submitFeedback(input)).resolves.toMatchObject({ ticketNumber: 'FB-123' });
  expect(mockUpload.mock.calls.map(([, options]) => JSON.parse(options.body).clientSubmissionId)).toEqual([input.clientSubmissionId, input.clientSubmissionId]);
});

it('cancels the active upload when its form is closed', async () => {
  const controller = new AbortController();
  mockUpload.mockImplementationOnce(async (_url, options) => { controller.abort(); expect(options.signal.aborted).toBe(true); return response(); });
  await expect(submitFeedback({ ...input, signal: controller.signal })).rejects.toThrow('request_aborted');
  expect(mockListeners.size).toBe(0);
});
