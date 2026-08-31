import {
  recoverApiUnauthorized,
  setApiAccessTokenProvider,
  setApiAuthRecovery,
} from '../api-client';

describe('API authentication recovery', () => {
  afterEach(() => {
    setApiAccessTokenProvider(undefined);
    setApiAuthRecovery(undefined);
  });

  it('retries with a newer session token and ignores a late 401 from the old login', async () => {
    const refresh = jest.fn<Promise<string | undefined>, []>();
    const onInvalidated = jest.fn();
    const retry = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    setApiAccessTokenProvider(async () => 'new-session-token');
    setApiAuthRecovery({ refresh, onInvalidated });

    await expect(recoverApiUnauthorized(
      new Response(null, { status: 401 }),
      retry,
      'old-session-token',
    )).resolves.toMatchObject({ status: 200 });

    expect(retry).toHaveBeenCalledWith('new-session-token');
    expect(refresh).not.toHaveBeenCalled();
    expect(onInvalidated).not.toHaveBeenCalled();
  });

  it('uses one refresh for parallel 401 responses and preserves the refreshed session', async () => {
    let currentToken = 'expired-token';
    let resolveRefresh!: (token: string) => void;
    const refresh = jest.fn(() => new Promise<string>((resolve) => {
      resolveRefresh = (token) => {
        currentToken = token;
        resolve(token);
      };
    }));
    const onInvalidated = jest.fn();
    setApiAccessTokenProvider(async () => currentToken);
    setApiAuthRecovery({ refresh, onInvalidated });
    const retry = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));

    const first = recoverApiUnauthorized(new Response(null, { status: 401 }), retry, 'expired-token');
    const second = recoverApiUnauthorized(new Response(null, { status: 401 }), retry, 'expired-token');
    for (let index = 0; index < 5 && refresh.mock.calls.length === 0; index += 1) await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    resolveRefresh('refreshed-token');

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: 200 }),
      expect.objectContaining({ status: 200 }),
    ]);
    expect(onInvalidated).not.toHaveBeenCalled();
  });

  it('invalidates only a still-current token that remains rejected after refresh', async () => {
    const refresh = jest.fn().mockResolvedValue('rejected-token');
    const onInvalidated = jest.fn().mockResolvedValue(undefined);
    const retry = jest.fn().mockResolvedValue(new Response(null, { status: 401 }));
    setApiAccessTokenProvider(async () => 'rejected-token');
    setApiAuthRecovery({ refresh, onInvalidated });

    await recoverApiUnauthorized(new Response(null, { status: 401 }), retry, 'rejected-token');

    expect(retry).toHaveBeenCalledTimes(1);
    expect(onInvalidated).toHaveBeenCalledTimes(1);
    expect(onInvalidated).toHaveBeenCalledWith('rejected-token');
  });
});
