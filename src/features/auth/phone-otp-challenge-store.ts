import { isChinaMobileE164, normalizeChinaMobile } from '@icao/contracts';
import type { NativeStartPhoneOtpResponse, PhoneOtpPurpose } from '@icao/contracts/native-auth';
import * as SecureStore from 'expo-secure-store';

export type PersistedPhoneOtpChallenge = {
  challengeId: string;
  expiresAt: number;
  issuedAt: number;
  phone: string;
  purpose: PhoneOtpPurpose;
  resendAllowedAt: number;
  serverTimeOffsetMs: number;
  version: 2;
};

const KEY = 'icao.auth.phone-otp-challenge.v2';
const LEGACY_KEY = 'icao.auth.phone-otp-challenge.v1';
const MAX_RESTORE_AGE_MS = 24 * 60 * 60 * 1_000;
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
let writeTail: Promise<void> = Promise.resolve();

async function withWriteLock<T>(operation: () => Promise<T>) {
  const previous = writeTail;
  let release!: () => void;
  writeTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

function validTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function parsePhoneOtpChallenge(
  value: unknown,
  deviceNow = Date.now(),
): PersistedPhoneOtpChallenge | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<PersistedPhoneOtpChallenge>;
  if (
    candidate.version !== 2
    || typeof candidate.challengeId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(candidate.challengeId)
    || (candidate.purpose !== 'login' && candidate.purpose !== 'recovery')
    || !isChinaMobileE164(candidate.phone)
    || !validTimestamp(candidate.issuedAt)
    || !validTimestamp(candidate.resendAllowedAt)
    || !validTimestamp(candidate.expiresAt)
    || typeof candidate.serverTimeOffsetMs !== 'number'
    || !Number.isSafeInteger(candidate.serverTimeOffsetMs)
    || candidate.issuedAt > candidate.resendAllowedAt
    || candidate.resendAllowedAt > candidate.expiresAt
    || deviceNow + candidate.serverTimeOffsetMs - candidate.expiresAt > MAX_RESTORE_AGE_MS
  ) return undefined;
  return candidate as PersistedPhoneOtpChallenge;
}

export function phoneOtpServerNow(challenge: PersistedPhoneOtpChallenge, deviceNow = Date.now()) {
  return deviceNow + challenge.serverTimeOffsetMs;
}

export function phoneOtpChallenge(
  phoneInput: string,
  purpose: PhoneOtpPurpose,
  response: NativeStartPhoneOtpResponse,
  receivedAt = Date.now(),
): PersistedPhoneOtpChallenge {
  const phone = normalizeChinaMobile(phoneInput);
  if (!phone) throw new Error('invalid_phone_number');
  const challenge = parsePhoneOtpChallenge({
    challengeId: response.challengeId,
    expiresAt: response.expiresAt,
    issuedAt: response.issuedAt,
    phone,
    purpose,
    resendAllowedAt: response.resendAllowedAt,
    serverTimeOffsetMs: response.serverTime - receivedAt,
    version: 2,
  }, receivedAt);
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
  if (!raw) {
    await SecureStore.deleteItemAsync(LEGACY_KEY, OPTIONS).catch(() => undefined);
    return undefined;
  }
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
  if (!parsePhoneOtpChallenge(challenge, Date.now())) {
    throw new Error('auth_service_unavailable');
  }
  return withWriteLock(async () => {
    try {
      const currentRaw = await SecureStore.getItemAsync(KEY, OPTIONS);
      const current = currentRaw
        ? parsePhoneOtpChallenge(JSON.parse(currentRaw) as unknown, Date.now())
        : undefined;
      if (
        current
        && (
          current.issuedAt > challenge.issuedAt
          || (current.issuedAt === challenge.issuedAt && current.challengeId !== challenge.challengeId)
        )
      ) return false;
      await SecureStore.setItemAsync(KEY, JSON.stringify(challenge), OPTIONS);
      await SecureStore.deleteItemAsync(LEGACY_KEY, OPTIONS).catch(() => undefined);
      return true;
    } catch {
      throw new Error('auth_session_storage_unavailable');
    }
  });
}

export async function clearPhoneOtpChallenge() {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(KEY, OPTIONS),
      SecureStore.deleteItemAsync(LEGACY_KEY, OPTIONS),
    ]);
  } catch {
    throw new Error('auth_session_storage_unavailable');
  }
}
