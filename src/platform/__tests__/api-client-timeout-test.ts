const mockFetch = jest.fn();

describe('API client cancellation and timeout boundary', () => {
  const originalApiUrl = process.env.EXPO_PUBLIC_ICAO_API_URL;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    mockFetch.mockReset();
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'https://api.example.test';
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.EXPO_PUBLIC_ICAO_API_URL = originalApiUrl;
  });

  function pendingUntilAborted() {
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
  }

  it('maps the internal 45 second deadline to ai_timeout', async () => {
    pendingUntilAborted();
    const { apiFetch } = jest.requireActual('@/platform/api-client') as typeof import('@/platform/api-client');
    const pending = apiFetch('/v1/ai/review');
    const observed = expect(pending).rejects.toMatchObject({ code: 'ai_timeout', status: 408 });

    await jest.advanceTimersByTimeAsync(45_001);
    await observed;
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('merges an external cancellation signal without misclassifying it as timeout', async () => {
    pendingUntilAborted();
    const { apiFetch } = jest.requireActual('@/platform/api-client') as typeof import('@/platform/api-client');
    const controller = new AbortController();
    const pending = apiFetch('/v1/ai/review', { signal: controller.signal });
    const observed = expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    await Promise.resolve();
    controller.abort();
    await observed;
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
