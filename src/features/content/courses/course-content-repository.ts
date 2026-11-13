import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { canonicalAppContentJson } from '@icao/contracts/app-content';
import Storage from '@/platform/storage';
import { withApiRequestTimeout } from '@/platform/api-client';
import builtinRelease from '../../../../public/course-content.json';
import { isCourseRelease, type CourseContentRelease } from './course-content-schema';

export const COURSE_CONTENT_URL = 'https://readyoufife.com/course-content.json';
const cacheKey = 'icao.course-content.v1';
export const builtinCourseRelease = builtinRelease as CourseContentRelease;
let pending: Promise<CourseContentRelease> | undefined;

async function verified(value: unknown): Promise<CourseContentRelease | undefined> {
  if (!isCourseRelease(value)) return undefined;
  const checksum = await digestStringAsync(CryptoDigestAlgorithm.SHA256, canonicalAppContentJson(value.payload));
  return checksum === value.checksum ? value : undefined;
}

export async function readAvailableCourses(): Promise<CourseContentRelease> {
  try {
    const raw = await Storage.getItem(cacheKey);
    const cached = raw ? await verified(JSON.parse(raw)) : undefined;
    if (cached && cached.version > builtinCourseRelease.version) return cached;
  } catch { /* An unreadable cache falls back to the bundled catalog. */ }
  return builtinCourseRelease;
}

export function refreshCourses(): Promise<CourseContentRelease> {
  if (pending) return pending;
  pending = (async () => {
    const current = await readAvailableCourses();
    try {
      const payload = await withApiRequestTimeout(async signal => {
        const response = await fetch(COURSE_CONTENT_URL, {
          signal, cache: 'no-cache', headers: { accept: 'application/json' },
        });
        return response.ok ? response.json() : undefined;
      }, undefined, 8000);
      const release = await verified(payload);
      if (!release || release.version < current.version
        || (release.version === current.version && release.checksum !== current.checksum)) return current;
      if (release.version !== current.version) {
        try { await Storage.setItem(cacheKey, JSON.stringify(release)); }
        catch { /* Valid remote content remains usable if local storage is full. */ }
      }
      return release;
    } catch { return current; }
  })().finally(() => { pending = undefined; });
  return pending;
}
