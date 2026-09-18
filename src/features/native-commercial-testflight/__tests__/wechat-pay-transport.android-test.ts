import { createWechatCheckout } from '../wechat-pay-client.android';

jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null }));

it('sends a JSON checkout through the real API transport with the captured account token', async () => {
  const before = process.env.EXPO_PUBLIC_ICAO_API_URL;
  process.env.EXPO_PUBLIC_ICAO_API_URL = 'https://api.example.test';
  const input = { productKey: 'membership_31d_v1', idempotencyKey: '80000000-0000-4000-8000-000000000001' };
  const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const request = new Request(url as string, init);
    // Exercise Headers and string-body handling rather than mock the API helper:
    // fetch otherwise defaults string bodies to text/plain and Nest rejects them.
    expect(request.headers.get('content-type')).toBe('application/json');
    expect(request.headers.get('authorization')).toBe('Bearer checkout-owner-token');
    expect(request.method).toBe('POST');
    expect(await request.json()).toEqual(input);
    return new Response(JSON.stringify({ data: { id: input.idempotencyKey, state: 'pending' }, requestId: 'transport-test' }), { status: 200 });
  });
  try {
    await expect(createWechatCheckout(input, 'checkout-owner-token')).resolves.toMatchObject({ state: 'pending' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  } finally {
    fetchSpy.mockRestore();
    if (before === undefined) delete process.env.EXPO_PUBLIC_ICAO_API_URL;
    else process.env.EXPO_PUBLIC_ICAO_API_URL = before;
  }
});
