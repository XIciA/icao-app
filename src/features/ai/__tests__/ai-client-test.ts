const mockApiRequest = jest.fn();
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
    getItem: jest.fn(async () => null),
    removeItem: jest.fn(async () => undefined),
    setItem: (key: string, value: string) => mockSetItem(key, value),
  },
}));

describe('Native AI client failure handling', () => {
  const originalApiUrl = process.env.EXPO_PUBLIC_ICAO_API_URL;

  beforeEach(() => {
    jest.resetModules();
    mockApiRequest.mockReset();
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

  it('resynchronizes consent once before retrying a refused review', async () => {
    const { ApiClientError } = jest.requireActual('@/platform/api-client') as typeof import('@/platform/api-client');
    mockApiRequest
      .mockRejectedValueOnce(new ApiClientError('ai_consent_required', 428, 'request-consent-1'))
      .mockResolvedValueOnce({ policyVersion: 'ai-learning-privacy-v4', acceptedAt: '2026-08-14T00:00:00.000Z' })
      .mockResolvedValueOnce({
        grammar: { correctedText: 'Ready.', issues: [] },
        promptVersion: 'deepseek-review:v1',
      });

    await expect(client().reviewExpression({
      mode: 'grammar', module: 'atc', questionId: 'question-1', transcript: 'Ready.',
    })).resolves.toMatchObject({ grammar: { correctedText: 'Ready.' } });

    expect(mockApiRequest).toHaveBeenCalledTimes(3);
    expect(mockApiRequest.mock.calls[1]?.[0]).toBe('/v1/ai/consent');
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
