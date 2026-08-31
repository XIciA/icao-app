import * as SecureStore from 'expo-secure-store';

import {
  clearPhoneOtpChallenge,
  phoneOtpChallenge,
  readPhoneOtpChallenge,
  writePhoneOtpChallenge,
} from '../phone-otp-challenge-store';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItemAsync = SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>;
const setItemAsync = SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>;
const deleteItemAsync = SecureStore.deleteItemAsync as jest.MockedFunction<typeof SecureStore.deleteItemAsync>;

describe('phone OTP challenge persistence', () => {
  beforeEach(() => {
    getItemAsync.mockReset();
    setItemAsync.mockReset().mockResolvedValue(undefined);
    deleteItemAsync.mockReset().mockResolvedValue(undefined);
  });

  it('round-trips only challenge metadata and never stores the OTP', async () => {
    const receivedAt = Date.now();
    const challenge = phoneOtpChallenge('13800138000', 'login', {
      accepted: true,
      challengeId: '10000000-0000-4000-8000-000000000010',
      expiresAt: receivedAt + 300_000,
      issuedAt: receivedAt,
      resendAllowedAt: receivedAt + 60_000,
      serverTime: receivedAt,
    }, receivedAt);
    await writePhoneOtpChallenge(challenge);
    const serialized = setItemAsync.mock.calls[0]?.[1];
    expect(serialized).toContain('+8613800138000');
    expect(serialized).not.toContain('123456');

    getItemAsync.mockResolvedValueOnce(serialized ?? null);
    await expect(readPhoneOtpChallenge(receivedAt + 1_000)).resolves.toEqual(challenge);
  });

  it('removes a legacy or malformed challenge instead of restoring it', async () => {
    getItemAsync.mockResolvedValueOnce(JSON.stringify({
      expiresAt: 1_700_000_300_000,
      issuedAt: 1_700_000_000_000,
      phone: '+8613800138000',
      purpose: 'login',
      resendAllowedAt: 1_700_000_060_000,
      version: 1,
    }));

    await expect(readPhoneOtpChallenge(1_700_000_300_000)).resolves.toBeUndefined();
    expect(deleteItemAsync).toHaveBeenCalledTimes(2);
  });

  it('restores a recently expired challenge so the UI preserves the correct entry state', async () => {
    const serialized = JSON.stringify({
      challengeId: '10000000-0000-4000-8000-000000000010',
      expiresAt: 1_700_000_300_000,
      issuedAt: 1_700_000_000_000,
      phone: '+8613800138000',
      purpose: 'login',
      resendAllowedAt: 1_700_000_060_000,
      serverTimeOffsetMs: 0,
      version: 2,
    });
    getItemAsync.mockResolvedValueOnce(serialized);

    await expect(readPhoneOtpChallenge(1_700_000_301_000)).resolves.toEqual(JSON.parse(serialized));
    expect(deleteItemAsync).not.toHaveBeenCalled();
  });

  it('surfaces secure-storage failures without exposing or corrupting challenge data', async () => {
    getItemAsync.mockRejectedValueOnce(new Error('keychain unavailable'));
    await expect(readPhoneOtpChallenge()).rejects.toThrow('auth_session_storage_unavailable');

    deleteItemAsync.mockRejectedValueOnce(new Error('keychain unavailable'));
    await expect(clearPhoneOtpChallenge()).rejects.toThrow('auth_session_storage_unavailable');
  });

  it('does not let a late response overwrite a newer persisted challenge generation', async () => {
    const now = Date.now();
    const newer = phoneOtpChallenge('13800138000', 'login', {
      accepted: true,
      challengeId: '20000000-0000-4000-8000-000000000020',
      expiresAt: now + 301_000,
      issuedAt: now + 1_000,
      resendAllowedAt: now + 61_000,
      serverTime: now + 1_000,
    }, now + 1_000);
    const older = phoneOtpChallenge('13800138000', 'login', {
      accepted: true,
      challengeId: '10000000-0000-4000-8000-000000000010',
      expiresAt: now + 300_000,
      issuedAt: now,
      resendAllowedAt: now + 60_000,
      serverTime: now,
    }, now);
    getItemAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(newer));

    await expect(writePhoneOtpChallenge(newer)).resolves.toBe(true);
    await expect(writePhoneOtpChallenge(older)).resolves.toBe(false);
    expect(setItemAsync).toHaveBeenCalledTimes(1);
    expect(setItemAsync).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify(newer),
      expect.any(Object),
    );
  });
});
