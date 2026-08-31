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
    const challenge = phoneOtpChallenge('13800138000', 'login', {
      accepted: true,
      expiresAt: 1_700_000_300_000,
      issuedAt: 1_700_000_000_000,
      resendAllowedAt: 1_700_000_060_000,
    });
    await writePhoneOtpChallenge(challenge);
    const serialized = setItemAsync.mock.calls[0]?.[1];
    expect(serialized).toContain('+8613800138000');
    expect(serialized).not.toContain('123456');

    getItemAsync.mockResolvedValueOnce(serialized ?? null);
    await expect(readPhoneOtpChallenge(1_700_000_001_000)).resolves.toEqual(challenge);
  });

  it('removes an expired or malformed challenge instead of restoring it', async () => {
    getItemAsync.mockResolvedValueOnce(JSON.stringify({
      expiresAt: 1_700_000_300_000,
      issuedAt: 1_700_000_000_000,
      phone: '+8613800138000',
      purpose: 'login',
      resendAllowedAt: 1_700_000_060_000,
      version: 1,
    }));

    await expect(readPhoneOtpChallenge(1_700_000_300_000)).resolves.toBeUndefined();
    expect(deleteItemAsync).toHaveBeenCalledTimes(1);
  });

  it('surfaces secure-storage failures without exposing or corrupting challenge data', async () => {
    getItemAsync.mockRejectedValueOnce(new Error('keychain unavailable'));
    await expect(readPhoneOtpChallenge()).rejects.toThrow('auth_session_storage_unavailable');

    deleteItemAsync.mockRejectedValueOnce(new Error('keychain unavailable'));
    await expect(clearPhoneOtpChallenge()).rejects.toThrow('auth_session_storage_unavailable');
  });
});
