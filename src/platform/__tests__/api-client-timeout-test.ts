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
      if (init?.signal?.aborted) {
        reject(new DOMException('aborted', 'AbortError'));
        return;
      }
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
  }

  it('sends a request with an external signal when React Native has no AbortSignal.any', async () => {
    const abortSignalConstructor = AbortSignal as typeof AbortSignal & { any?: unknown };
    const originalDescriptor = Object.getOwnPropertyDescriptor(abortSignalConstructor, 'any');
    Object.defineProperty(abortSignalConstructor, 'any', { configurable: true, value: undefined });
    mockFetch.mockResolvedValue({ status: 200 } as Response);
    const { apiFetch } = jest.requireActual('@/platform/api-client') as typeof import('@/platform/api-client');
    const controller = new AbortController();

    try {
      await expect(apiFetch('/v1/ai/review', { signal: controller.signal })).resolves.toMatchObject({ status: 200 });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    } finally {
      if (originalDescriptor) Object.defineProperty(abortSignalConstructor, 'any', originalDescriptor);
      else Reflect.deleteProperty(abortSignalConstructor, 'any');
    }
  });

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

  it('forwards an already-aborted external signal without sending an active request', async () => {
    pendingUntilAborted();
    const { apiFetch } = jest.requireActual('@/platform/api-client') as typeof import('@/platform/api-client');
    const controller = new AbortController();
    controller.abort();

    await expect(apiFetch('/v1/ai/review', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('removes the external abort listener after a completed request', async () => {
    mockFetch.mockResolvedValue({ status: 200 } as Response);
    const { apiFetch } = jest.requireActual('@/platform/api-client') as typeof import('@/platform/api-client');
    const controller = new AbortController();
    const removeListener = jest.spyOn(controller.signal, 'removeEventListener');

    await apiFetch('/v1/ai/review', { signal: controller.signal });

    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
