/* eslint-disable @typescript-eslint/no-require-imports */

describe('EdgeOne Web API client', () => {
  const originalRuntime = process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;
  const originalApiUrl = process.env.EXPO_PUBLIC_ICAO_API_URL;

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    if (originalRuntime === undefined) delete process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;
    else process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = originalRuntime;
    if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_ICAO_API_URL;
    else process.env.EXPO_PUBLIC_ICAO_API_URL = originalApiUrl;
  });

  it.each([undefined, 'edgeone-production'])('calls the Production ECS API with the Supabase bearer token for runtime %s', async (runtime) => {
    if (runtime === undefined) delete process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;
    else process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = runtime;
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'https://api.readyoufife.com';

    await jest.isolateModulesAsync(async () => {
      const api = require('../api-client.web') as typeof import('../api-client.web');
      api.setApiAccessTokenProvider(async () => 'test-access-token');
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
        data: { cursor: 0 },
        requestId: 'request-1',
      }), { status: 200 }));

      await expect(api.apiRequest<{ cursor: number }>('/v1/sync/pull?cursor=0')).resolves.toEqual({ cursor: 0 });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.readyoufife.com/v1/sync/pull?cursor=0',
        expect.objectContaining({
          credentials: 'omit',
          headers: expect.any(Headers),
        }),
      );
      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
      expect(headers.get('authorization')).toBe('Bearer test-access-token');
    });
  });

  it('preserves the explicitly selected legacy same-origin function routes', async () => {
    process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = 'vercel-legacy';
    await jest.isolateModulesAsync(async () => {
      const api = require('../api-client.web') as typeof import('../api-client.web');
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
        data: { accepted: true },
        requestId: 'request-2',
      }), { status: 200 }));

      await api.apiRequest('/v1/ai/consent');
      expect(fetchMock).toHaveBeenCalledWith('/api/ai/consent', expect.objectContaining({ credentials: 'include' }));
    });
  });
});
