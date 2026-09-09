import { useEffect, useState } from 'react';
import Storage from '@/platform/storage';
import { enqueueAccountProfile } from '@/features/sync/learning-sync.native';
import { DEFAULT_PROFILE, normalizeProfile, type UserProfile } from './profile-model';

export { DEFAULT_PROFILE, type UserProfile } from './profile-model';

const PROFILE_PREFIX = 'icao.account.profile.v2.';
let accountId: string | undefined;
let epoch = 0;
let cached: UserProfile = { ...DEFAULT_PROFILE };
let readPromise: Promise<UserProfile> | undefined;
let writeQueue = Promise.resolve();
const listeners = new Set<(profile: UserProfile) => void>();

function publish(profile: UserProfile) {
  cached = profile;
  listeners.forEach((listener) => listener(profile));
}

export function setProfileAccount(nextAccountId?: string) {
  if (nextAccountId === accountId) return;
  accountId = nextAccountId;
  epoch += 1;
  readPromise = undefined;
  publish({ ...DEFAULT_PROFILE });
  if (accountId) void readProfile().catch(() => undefined);
}

export function readProfile(): Promise<UserProfile> {
  if (!accountId) return Promise.resolve({ ...DEFAULT_PROFILE });
  if (readPromise) return readPromise;
  const owner = accountId;
  const requestEpoch = epoch;
  const promise = Storage.getItem(`${PROFILE_PREFIX}${owner}`).then((raw) => {
    let profile = { ...DEFAULT_PROFILE };
    try { profile = normalizeProfile(raw ? JSON.parse(raw) : undefined); } catch { /* Invalid local data uses defaults. */ }
    if (epoch === requestEpoch) publish(profile);
    return epoch === requestEpoch ? profile : cached;
  });
  readPromise = promise;
  void promise.catch(() => { if (readPromise === promise) readPromise = undefined; });
  return promise;
}

function assertOwner(owner: string, requestEpoch: number) {
  if (accountId !== owner || epoch !== requestEpoch) throw new Error('profile_account_changed');
}

function write(operation: () => Promise<void>) {
  const next = writeQueue.catch(() => undefined).then(operation);
  writeQueue = next.then(() => undefined, () => undefined);
  return next;
}

export async function updateProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
  const owner = accountId;
  const requestEpoch = epoch;
  if (!owner) throw new Error('profile_account_required');
  let result: UserProfile = cached;
  await write(async () => {
    const current = await readProfile();
    assertOwner(owner, requestEpoch);
    result = normalizeProfile({ ...current, ...patch });
    await Storage.setItem(`${PROFILE_PREFIX}${owner}`, JSON.stringify(result));
    assertOwner(owner, requestEpoch);
    await enqueueAccountProfile(result);
    assertOwner(owner, requestEpoch);
    readPromise = Promise.resolve(result);
    publish(result);
  });
  return result;
}

export async function replaceProfileFromSync(document: unknown) {
  const owner = accountId;
  const requestEpoch = epoch;
  if (!owner) return;
  await write(async () => {
    assertOwner(owner, requestEpoch);
    const next = normalizeProfile(document);
    await Storage.setItem(`${PROFILE_PREFIX}${owner}`, JSON.stringify(next));
    assertOwner(owner, requestEpoch);
    readPromise = Promise.resolve(next);
    publish(next);
  });
}

export async function clearProfile(targetAccountId = accountId) {
  const owner = targetAccountId;
  const requestEpoch = epoch;
  await write(async () => {
    if (owner) await Storage.removeItem(`${PROFILE_PREFIX}${owner}`);
    if (epoch === requestEpoch && accountId === owner) {
      readPromise = undefined;
      publish({ ...DEFAULT_PROFILE });
    }
  });
}

export function useProfile() {
  const [profile, setProfile] = useState(cached);
  useEffect(() => {
    listeners.add(setProfile);
    setProfile(cached);
    void readProfile().catch(() => undefined);
    return () => { listeners.delete(setProfile); };
  }, []);
  return profile;
}
