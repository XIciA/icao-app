/* eslint-disable @typescript-eslint/no-require-imports */
import { normalizeChinaMobile } from '../auth-service.web';

const originalEnvironment = { ...process.env };
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

afterEach(() => {
  process.env = { ...originalEnvironment };
  jest.restoreAllMocks();
  jest.resetModules();
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

describe('Web phone authentication', () => {
  it.each([
    ['13800138000', '+8613800138000'],
    ['+86 138 0013 8000', '+8613800138000'],
    ['0086-13800138000', '+8613800138000'],
  ])('normalizes a mainland phone number without changing account identity', (input, expected) => {
    expect(normalizeChinaMobile(input)).toBe(expected);
  });

  it.each(['', '1380013800', '12800138000', '861380013800'])('rejects invalid phone input: %s', (input) => {
    expect(() => normalizeChinaMobile(input)).toThrow('invalid_phone_number');
  });

  it('requests and verifies an OTP against Supabase, then persists the session', async () => {
    process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = 'edgeone-production';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://cloud.example.test';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-test-key';

    const stored = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => stored.get(key) ?? null,
        removeItem: (key: string) => stored.delete(key),
        setItem: (key: string, value: string) => stored.set(key, value),
      },
    });

    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        json: async () => ({}),
        ok: true,
        status: 200,
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({
          access_token: 'access-token',
          expires_at: Math.floor(Date.now() / 1_000) + 3_600,
          refresh_token: 'refresh-token',
          user: { id: 'user-1' },
        }),
        ok: true,
        status: 200,
      } as Response);

    let service: import('../auth-service.web').AuthService | undefined;
    jest.isolateModules(() => {
      service = require('../auth-service.web').getAuthService();
    });
    expect(service?.mode).toBe('phone-otp');

    await service?.requestPhoneOtp('13800138000');
    const session = await service?.verifyPhoneOtp('13800138000', '123456');
    service?.stopAutoRefresh();

    expect(session).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://cloud.example.test/auth/v1/otp');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://cloud.example.test/auth/v1/verify');
    expect(stored.get('icao.auth.web.supabase.v1')).toContain('access-token');

    const otpRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(otpRequest.body))).toEqual({ phone: '+8613800138000', create_user: true });
    expect(new Headers(otpRequest.headers).get('apikey')).toBe('public-test-key');
  });
});
