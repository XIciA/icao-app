/* eslint-disable import/first */
const mockValues = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: jest.fn(async (key: string) => mockValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockValues.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockValues.delete(key); }),
}));

import { secureSessionStorage } from '../secure-session-storage';

describe('secure session storage', () => {
  beforeEach(() => mockValues.clear());

  it('round-trips a session larger than a single SecureStore value', async () => {
    const session = 'session'.repeat(1_200);
    await secureSessionStorage.setItem('supabase.auth.token', session);

    expect(await secureSessionStorage.getItem('supabase.auth.token')).toBe(session);
    expect(mockValues.size).toBeGreaterThan(2);
  });

  it('removes stale chunks after shrinking or deleting a session', async () => {
    await secureSessionStorage.setItem('session', 'x'.repeat(5_000));
    await secureSessionStorage.setItem('session', 'short');
    expect(await secureSessionStorage.getItem('session')).toBe('short');
    expect(Array.from(mockValues.keys()).some((key) => key === 'session.1')).toBe(false);

    await secureSessionStorage.removeItem('session');
    expect(await secureSessionStorage.getItem('session')).toBeNull();
  });
});
