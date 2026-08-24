/* eslint-disable import/first */
const mockValues = new Map<string, string>();

jest.mock('@/platform/storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockValues.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockValues.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockValues.delete(key); }),
  },
}));

import Storage from '@/platform/storage';

import {
  activateRadioPlayerSession,
  clearRadioPlayerAccountData,
  RADIO_PLAYER_STORAGE_KEY,
  readRadioPlayerSnapshot,
  registerRadioPlayerRuntimeReset,
  saveRadioPlayerSnapshot,
} from '../radio-player-storage';

describe('radio player account lifecycle', () => {
  beforeEach(async () => {
    mockValues.clear();
    jest.clearAllMocks();
    await clearRadioPlayerAccountData();
  });

  it('clears runtime and prevents background persistence from recreating deleted-account data', async () => {
    const resetRuntime = jest.fn(async () => undefined);
    const unregister = registerRadioPlayerRuntimeReset(resetRuntime);
    await activateRadioPlayerSession();
    await saveRadioPlayerSnapshot('{"trackId":"old-account-track"}');
    expect(await readRadioPlayerSnapshot()).toContain('old-account-track');

    await clearRadioPlayerAccountData();
    await saveRadioPlayerSnapshot('{"trackId":"late-background-write"}');

    expect(resetRuntime).toHaveBeenCalledTimes(1);
    expect(mockValues.has(RADIO_PLAYER_STORAGE_KEY)).toBe(false);
    expect(Storage.setItem).toHaveBeenCalledTimes(1);

    await activateRadioPlayerSession();
    expect(await readRadioPlayerSnapshot()).toBeNull();
    unregister();
  });

  it('waits for an in-flight logout cleanup before activating the next account', async () => {
    let releaseRuntimeReset!: () => void;
    const runtimeReset = new Promise<void>((resolve) => { releaseRuntimeReset = resolve; });
    const unregister = registerRadioPlayerRuntimeReset(() => runtimeReset);
    await activateRadioPlayerSession();
    await saveRadioPlayerSnapshot('{"trackId":"old-account-track"}');

    const clearing = clearRadioPlayerAccountData();
    const activatingNextAccount = activateRadioPlayerSession();
    await saveRadioPlayerSnapshot('{"trackId":"late-background-write"}');

    expect(await readRadioPlayerSnapshot()).toBeNull();
    expect(mockValues.get(RADIO_PLAYER_STORAGE_KEY)).toContain('old-account-track');
    releaseRuntimeReset();
    await clearing;
    await expect(activatingNextAccount).resolves.toBe(true);

    expect(await readRadioPlayerSnapshot()).toBeNull();
    expect(mockValues.has(RADIO_PLAYER_STORAGE_KEY)).toBe(false);
    unregister();
  });

  it('keeps the next account inactive when old snapshot removal fails', async () => {
    await activateRadioPlayerSession();
    await saveRadioPlayerSnapshot('{"trackId":"old-account-track"}');
    (Storage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('storage_unavailable'));

    await expect(clearRadioPlayerAccountData()).rejects.toThrow('storage_unavailable');
    await expect(activateRadioPlayerSession()).resolves.toBe(false);
    await saveRadioPlayerSnapshot('{"trackId":"new-account-track"}');

    expect(await readRadioPlayerSnapshot()).toBeNull();
    expect(mockValues.get(RADIO_PLAYER_STORAGE_KEY)).toContain('old-account-track');
  });
});
