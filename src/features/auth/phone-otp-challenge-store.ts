import { isChinaMobileE164, normalizeChinaMobile, type StartPhoneOtpResponse } from '@icao/contracts';
import * as SecureStore from 'expo-secure-store';

export type PhoneOtpPurpose = 'login' | 'recovery';

export type PersistedPhoneOtpChallenge = {
  expiresAt: number;
  issuedAt: number;
  phone: string;
  purpose: PhoneOtpPurpose;
  resendAllowedAt: number;
  version: 1;
};

const KEY = 'icao.auth.phone-otp-challenge.v1';
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function validTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function parsePhoneOtpChallenge(
  value: unknown,
  now = Date.now(),
): PersistedPhoneOtpChallenge | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<PersistedPhoneOtpChallenge>;
  if (
    candidate.version !== 1
    || (candidate.purpose !== 'login' && candidate.purpose !== 'recovery')
    || !isChinaMobileE164(candidate.phone)
    || !validTimestamp(candidate.issuedAt)
    || !validTimestamp(candidate.resendAllowedAt)
    || !validTimestamp(candidate.expiresAt)
    || candidate.issuedAt > candidate.resendAllowedAt
    || candidate.resendAllowedAt > candidate.expiresAt
    || candidate.expiresAt <= now
  ) return undefined;
  return candidate as PersistedPhoneOtpChallenge;
}

export function phoneOtpChallenge(
  phoneInput: string,
  purpose: PhoneOtpPurpose,
  response: StartPhoneOtpResponse,
): PersistedPhoneOtpChallenge {
  const phone = normalizeChinaMobile(phoneInput);
  if (!phone) throw new Error('invalid_phone_number');
  const challenge = parsePhoneOtpChallenge({
    expiresAt: response.expiresAt,
    issuedAt: response.issuedAt,
    phone,
    purpose,
    resendAllowedAt: response.resendAllowedAt,
    version: 1,
  }, response.issuedAt - 1);
  if (!challenge) throw new Error('auth_service_unavailable');
  return challenge;
}

export async function readPhoneOtpChallenge(now = Date.now()) {
  let raw: string | null;
  try {
    raw = await SecureStore.getItemAsync(KEY, OPTIONS);
  } catch {
    throw new Error('auth_session_storage_unavailable');
  }
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  const challenge = parsePhoneOtpChallenge(parsed, now);
  if (challenge) return challenge;
  await clearPhoneOtpChallenge();
  return undefined;
}

export async function writePhoneOtpChallenge(challenge: PersistedPhoneOtpChallenge) {
  if (!parsePhoneOtpChallenge(challenge, challenge.issuedAt - 1)) {
    throw new Error('auth_service_unavailable');
  }
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(challenge), OPTIONS);
  } catch {
    throw new Error('auth_session_storage_unavailable');
  }
}

export async function clearPhoneOtpChallenge() {
  try {
    await SecureStore.deleteItemAsync(KEY, OPTIONS);
  } catch {
    throw new Error('auth_session_storage_unavailable');
  }
}
