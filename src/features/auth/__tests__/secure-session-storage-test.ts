/* eslint-disable import/first */
const mockValues = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: jest.fn(async (key: string) => mockValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockValues.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockValues.delete(key); }),
}));

import { secureSessionStorage } from '../secure-session-storage';

const secureStore = jest.requireMock('expo-secure-store') as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

describe('secure session storage', () => {
  beforeEach(() => {
    mockValues.clear();
    secureStore.getItemAsync.mockReset().mockImplementation(async (key: string) => mockValues.get(key) ?? null);
    secureStore.setItemAsync.mockReset().mockImplementation(async (key: string, value: string) => { mockValues.set(key, value); });
    secureStore.deleteItemAsync.mockReset().mockImplementation(async (key: string) => { mockValues.delete(key); });
  });

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

  it('serializes a read behind an in-flight write for the same session key', async () => {
    await secureSessionStorage.setItem('session', 'old');
    let releaseWrite!: () => void;
    secureStore.setItemAsync.mockImplementationOnce(async (key: string, value: string) => {
      await new Promise<void>((resolve) => { releaseWrite = resolve; });
      mockValues.set(key, value);
    });

    const write = secureSessionStorage.setItem('session', 'new');
    for (let attempt = 0; attempt < 10 && !releaseWrite; attempt += 1) await Promise.resolve();
    expect(releaseWrite).toBeDefined();
    const read = secureSessionStorage.getItem('session');
    let readCompleted = false;
    void read.then(() => { readCompleted = true; });
    await Promise.resolve();
    expect(readCompleted).toBe(false);

    releaseWrite();
    await write;
    await expect(read).resolves.toBe('new');
  });

  it('does not let an older removal delete a later session write', async () => {
    await secureSessionStorage.setItem('session', 'old');
    let releaseRemoval!: () => void;
    secureStore.deleteItemAsync.mockImplementationOnce(async (key: string) => {
      await new Promise<void>((resolve) => { releaseRemoval = resolve; });
      mockValues.delete(key);
    });

    const removal = secureSessionStorage.removeItem('session');
    for (let attempt = 0; attempt < 10 && !releaseRemoval; attempt += 1) await Promise.resolve();
    expect(releaseRemoval).toBeDefined();
    const write = secureSessionStorage.setItem('session', 'new');
    releaseRemoval();
    await removal;
    await write;

    await expect(secureSessionStorage.getItem('session')).resolves.toBe('new');
  });
});
