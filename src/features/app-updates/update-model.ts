import { DATA_ENVIRONMENT } from '@/config/data-environment';

export type UpdateChannel = 'android-apk' | 'android-test' | 'ios-testflight' | 'ios-app-store';
export type AppUpdate = { channel: UpdateChannel; version: string; build: number; available: true; url: string; notes: string; publishedAt: string };
export const ANDROID_UPDATE_PAGE_URL = 'https://readyoufife.com/download?android=auto';
const updateStorageOrigin = DATA_ENVIRONMENT === 'testing'
  ? process.env.EXPO_PUBLIC_SUPABASE_URL : 'https://cloud.readyoufife.com';
export const APP_UPDATE_MANIFEST_URL = `${updateStorageOrigin}/storage/v1/object/public/app-releases/updates.json`;

export function parseAppUpdates(value: unknown): AppUpdate[] {
  if (!value || typeof value !== 'object' || (value as { schemaVersion?: unknown }).schemaVersion !== 1) return [];
  const releases = (value as { releases?: unknown }).releases;
  if (!Array.isArray(releases)) return [];
  return releases.filter((raw): raw is AppUpdate => {
    if (!raw || typeof raw !== 'object') return false;
    const item = raw as AppUpdate;
    if (!['android-apk', 'android-test', 'ios-testflight', 'ios-app-store'].includes(item.channel) || item.available !== true
      || !/^\d+\.\d+\.\d+$/u.test(item.version) || !Number.isSafeInteger(item.build) || item.build <= 0
      || typeof item.notes !== 'string' || item.notes.length > 2000 || !Number.isFinite(Date.parse(item.publishedAt))) return false;
    if (DATA_ENVIRONMENT === 'testing' && ['android-apk', 'ios-app-store'].includes(item.channel)) return false;
    if ((item.channel === 'android-apk' || item.channel === 'android-test')) {
      try {
        const url = new URL(item.url);
        return url.origin === updateStorageOrigin && !url.search && !url.hash && !url.username && !url.password
          && /^\/storage\/v1\/object\/public\/app-releases\/android\/[A-Za-z0-9._-]+\.apk$/u.test(url.pathname);
      } catch { return false; }
    }
    if (item.channel === 'ios-app-store') return item.url === 'https://apps.apple.com/cn/app/id6800583111';
    return item.url === 'https://testflight.apple.com/' || /^https:\/\/testflight\.apple\.com\/join\/[A-Za-z0-9]+$/u.test(item.url);
  });
}
export function newerAppUpdate(releases: AppUpdate[], channel: UpdateChannel, version: string | null, build: string | null) {
  if (!version || !/^\d+\.\d+\.\d+$/u.test(version) || !build || !/^\d+$/u.test(build)) return undefined;
  const compare = (a: string, b: string) => {
    const left = a.split('.').map(Number); const right = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
    return 0;
  };
  return releases.filter((item) => item.channel === channel && ((channel === 'android-apk' || channel === 'android-test')
    ? item.build > Number(build) && compare(item.version, version) >= 0
    : compare(item.version, version) > 0 || compare(item.version, version) === 0 && item.build > Number(build)))
    .sort((a, b) => compare(b.version, a.version) || b.build - a.build)[0];
}
