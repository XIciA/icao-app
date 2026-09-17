import { isChinaMobileE164, normalizeChinaMobile } from '@icao/contracts';
import type { NativeStartPhoneOtpResponse, PhoneOtpPurpose } from '@icao/contracts/native-auth';
import { phoneOtpStorage } from './phone-otp-storage';

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
let mutationTail: Promise<void> = Promise.resolve();
let mutationGeneration = 0;

async function withMutationLock<T>(operation: () => Promise<T>) {
  const previous = mutationTail;
  let release!: () => void;
  mutationTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

/**
 * Allocates a storage generation when an OTP request starts, rather than when
 * its network response happens to finish. A response may only persist its
 * challenge while this generation is still current.
 */
export function beginPhoneOtpChallengeMutation() {
  mutationGeneration += 1;
  return mutationGeneration;
}

/** Invalidates an in-flight response without deleting a valid saved challenge. */
export function invalidatePhoneOtpChallengeMutation() {
  mutationGeneration += 1;
  return mutationGeneration;
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
  return withMutationLock(async () => {
    let raw: string | null;
    try {
      raw = await phoneOtpStorage.getItem(KEY);
    } catch {
      throw new Error('auth_session_storage_unavailable');
    }
    if (!raw) {
      await phoneOtpStorage.removeItem(LEGACY_KEY).catch(() => undefined);
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
    try {
      await Promise.all([
        phoneOtpStorage.removeItem(KEY),
        phoneOtpStorage.removeItem(LEGACY_KEY),
      ]);
    } catch {
      throw new Error('auth_session_storage_unavailable');
    }
    return undefined;
  });
}

export async function writePhoneOtpChallenge(
  challenge: PersistedPhoneOtpChallenge,
  generation = beginPhoneOtpChallengeMutation(),
) {
  if (!parsePhoneOtpChallenge(challenge, Date.now())) {
    throw new Error('auth_service_unavailable');
  }
  return withMutationLock(async () => {
    if (generation !== mutationGeneration) return false;
    let currentRaw: string | null = null;
    try {
      currentRaw = await phoneOtpStorage.getItem(KEY);
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
      await phoneOtpStorage.setItem(KEY, JSON.stringify(challenge));
      if (generation !== mutationGeneration) {
        if (currentRaw) await phoneOtpStorage.setItem(KEY, currentRaw);
        else await phoneOtpStorage.removeItem(KEY);
        return false;
      }
      await phoneOtpStorage.removeItem(LEGACY_KEY).catch(() => undefined);
      return true;
    } catch {
      throw new Error('auth_session_storage_unavailable');
    }
  });
}

export async function clearPhoneOtpChallenge() {
  beginPhoneOtpChallengeMutation();
  return withMutationLock(async () => {
    try {
      await Promise.all([
        phoneOtpStorage.removeItem(KEY),
        phoneOtpStorage.removeItem(LEGACY_KEY),
      ]);
    } catch {
      throw new Error('auth_session_storage_unavailable');
    }
  });
}
