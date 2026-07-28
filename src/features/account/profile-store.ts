import { useEffect, useState } from 'react';
import Storage from '@/platform/storage';

export type UserProfile = {
  avatarUri: string | null;
  gender: string;
  targetLevel: string;
  signature: string;
  region: string;
};

const PROFILE_STORAGE_KEY = 'icao.user.profile.v1';

export const DEFAULT_PROFILE: UserProfile = {
  avatarUri: null,
  gender: '男',
  targetLevel: 'ICAO 4 级',
  signature: '每天进步一点点，冲刺 ICAO 4 级！',
  region: '四川 · 广汉',
};

let cachedProfile: UserProfile | null = null;
const listeners = new Set<(profile: UserProfile) => void>();

export async function readProfile(): Promise<UserProfile> {
  if (cachedProfile) return cachedProfile;
  try {
    const raw = await Storage.getItem(PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserProfile>;
      cachedProfile = { ...DEFAULT_PROFILE, ...parsed };
      return cachedProfile;
    }
  } catch {
    // fallback
  }
  cachedProfile = { ...DEFAULT_PROFILE };
  return cachedProfile;
}

export async function updateProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
  const current = await readProfile();
  const next: UserProfile = { ...current, ...patch };
  cachedProfile = next;
  try {
    await Storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  listeners.forEach((listener) => listener(next));
  return next;
}

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile>(cachedProfile ?? DEFAULT_PROFILE);

  useEffect(() => {
    let active = true;
    void readProfile().then((data) => {
      if (active) setProfile(data);
    });
    const listener = (next: UserProfile) => {
      if (active) setProfile(next);
    };
    listeners.add(listener);
    return () => {
      active = false;
      listeners.delete(listener);
    };
  }, []);

  return profile;
}
