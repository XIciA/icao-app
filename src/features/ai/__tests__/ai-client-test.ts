const mockApiRequest = jest.fn();
const mockGetItem = jest.fn(async (_key: string) => null as string | null);
const mockRemoveItem = jest.fn(async (_key: string) => undefined);
const mockSetItem = jest.fn(async (_key: string, _value: string) => undefined);
const mockCreateAudioUploadForm = jest.fn();
const mockGetAsrModel = jest.fn(async () => '16k_en');

jest.mock('@/platform/api-client', () => {
  const actual = jest.requireActual('@/platform/api-client');
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  };
});

jest.mock('@/platform/audio-upload', () => ({
  createAudioUploadForm: (...args: unknown[]) => mockCreateAudioUploadForm(...args),
}));

jest.mock('@/features/ai/asr-model-preference', () => ({
  getAsrModel: () => mockGetAsrModel(),
}));

jest.mock('@/platform/storage', () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => mockGetItem(key),
    removeItem: (key: string) => mockRemoveItem(key),
    setItem: (key: string, value: string) => mockSetItem(key, value),
  },
}));

describe('Native AI client failure handling', () => {
  const originalApiUrl = process.env.EXPO_PUBLIC_ICAO_API_URL;

  beforeEach(() => {
    jest.resetModules();
    mockApiRequest.mockReset();
    mockGetItem.mockReset();
    mockGetItem.mockResolvedValue(null);
    mockRemoveItem.mockReset();
    mockRemoveItem.mockResolvedValue(undefined);
    mockSetItem.mockClear();
    mockCreateAudioUploadForm.mockReset();
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'https://api.example.test';
    const api = jest.requireActual('@/platform/api-client') as typeof import('@/platform/api-client');
    api.setApiAccessTokenProvider(async () => 'test-access-token');
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.EXPO_PUBLIC_ICAO_API_URL = originalApiUrl;
    const api = jest.requireActual('@/platform/api-client') as typeof import('@/platform/api-client');
    api.setApiAccessTokenProvider(undefined);
  });

  function client() {
    return jest.requireActual('@/features/ai/ai-client') as typeof import('@/features/ai/ai-client');
  }

  it('does not silently accept or retry when another device has revoked consent', async () => {
    const { ApiClientError } = jest.requireActual('@/platform/api-client') as typeof import('@/platform/api-client');
    mockApiRequest.mockRejectedValueOnce(new ApiClientError('ai_consent_required', 428, 'request-consent-1'));

    await expect(client().reviewExpression({
      mode: 'grammar', module: 'atc', questionId: 'question-1', transcript: 'Ready.',
    })).rejects.toMatchObject({ code: 'ai_consent_required', requestId: 'request-consent-1' });

    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).not.toHaveBeenCalledWith('/v1/ai/consent', expect.objectContaining({ method: 'POST' }));
    expect(mockRemoveItem).toHaveBeenCalledWith('icao.ai.consent.ai-learning-privacy-v4');
  });

  it('treats the server as authoritative when this device has an old accepted cache', async () => {
    mockGetItem.mockResolvedValue('accepted');
    mockApiRequest.mockResolvedValueOnce({
      accepted: false,
      policyVersion: 'ai-learning-privacy-v4',
    });

    await expect(client().getCachedAiConsentHint()).resolves.toBe(true);
    await expect(client().hasAiConsent()).resolves.toBe(false);

    expect(mockApiRequest).toHaveBeenCalledWith('/v1/ai/consent');
    expect(mockRemoveItem).toHaveBeenCalledWith('icao.ai.consent.ai-learning-privacy-v4');
  });

  it('does not carry consent from the previous account after an account switch', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ accepted: true, policyVersion: 'ai-learning-privacy-v4', acceptedAt: '2026-08-14T00:00:00.000Z' })
      .mockResolvedValueOnce({ accepted: false, policyVersion: 'ai-learning-privacy-v4' });

    await expect(client().hasAiConsent()).resolves.toBe(true);
    await expect(client().hasAiConsent()).resolves.toBe(false);

    expect(mockSetItem).toHaveBeenCalledTimes(1);
    expect(mockRemoveItem).toHaveBeenCalledTimes(1);
  });

  it('rejects an accepted status for a superseded policy version', async () => {
    mockApiRequest.mockResolvedValueOnce({
      accepted: true,
      policyVersion: 'ai-learning-privacy-v3',
      acceptedAt: '2026-08-14T00:00:00.000Z',
    });

    await expect(client().hasAiConsent()).resolves.toBe(false);
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockRemoveItem).toHaveBeenCalledTimes(1);
  });

  it('does not retry a potentially chargeable upstream failure', async () => {
    const { ApiClientError } = jest.requireActual('@/platform/api-client') as typeof import('@/platform/api-client');
    mockApiRequest.mockRejectedValueOnce(new ApiClientError('ai_upstream_limited', 503, 'request-limited-1'));

    await expect(client().reviewExpression({
      mode: 'grammar', module: 'atc', questionId: 'question-2', transcript: 'Ready.',
    })).rejects.toMatchObject({
      capability: 'grammar', code: 'ai_upstream_limited', requestId: 'request-limited-1', retryable: true,
    });
    expect(mockApiRequest).toHaveBeenCalledTimes(1);
  });

  it('forwards an external cancellation signal to the native review request', async () => {
    mockApiRequest.mockResolvedValueOnce({
      grammar: { correctedText: 'Ready.', issues: [] },
      promptVersion: 'deepseek-review:v1',
    });
    const controller = new AbortController();

    await client().reviewExpression({
      mode: 'grammar', module: 'atc', questionId: 'question-signal', transcript: 'Ready.',
    }, controller.signal);

    expect(mockApiRequest).toHaveBeenCalledWith('/v1/ai/review', expect.objectContaining({ signal: controller.signal }));
  });

  it('applies the same 45 second deadline to the native multipart upload', async () => {
    jest.useFakeTimers();
    const uploadFetch = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    mockCreateAudioUploadForm.mockResolvedValue({ form: {} as FormData, fetch: uploadFetch });

    const controller = new AbortController();
    const pending = client().transcribeRecording('file:///recording.m4a', controller.signal);
    const observed = expect(pending).rejects.toMatchObject({
      capability: 'transcribe',
      code: 'ai_timeout',
      retryable: true,
    });

    await jest.advanceTimersByTimeAsync(45_001);
    await observed;
    expect(uploadFetch).toHaveBeenCalledTimes(1);
  });
});
