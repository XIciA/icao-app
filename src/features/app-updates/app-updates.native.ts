import { applicationId, nativeApplicationVersion, nativeBuildVersion } from 'expo-application';
import { getIcaoDistributionEnvironment } from '@icao/distribution-environment';
import { Linking, Platform } from 'react-native';
import Storage from '@/platform/storage';
import { withApiRequestTimeout } from '@/platform/api-client';
import { APP_UPDATE_MANIFEST_URL, newerAppUpdate, parseAppUpdates, type AppUpdate } from './update-model';

const CHECK = 'icao.app-update.check.v2';
const SNOOZED = 'icao.app-update.snoozed.v2';
const CHECK_INTERVAL = 60 * 60 * 1000;
const RETRY_INTERVAL = 60 * 1000;
const SNOOZE_INTERVAL = 24 * 60 * 60 * 1000;
let inFlight: Promise<AppUpdate | undefined> | undefined;
const key = (update: AppUpdate) => `${update.channel}:${update.version}:${update.build}`;

/** Cold starts check afresh; foreground checks retain pending results. */
export async function checkAppUpdate(mode: boolean | 'startup' = false): Promise<AppUpdate | undefined> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return undefined;
  const channel = Platform.OS === 'android' ? applicationId?.endsWith('.test') ? 'android-test' : 'android-apk'
    : getIcaoDistributionEnvironment() === 'sandbox' ? 'ios-testflight' : 'ios-app-store';
  const installed = `${channel}:${nativeApplicationVersion}:${nativeBuildVersion}`;
  let cached: { installed?: string; at?: number; ok?: boolean; update?: unknown } | undefined;
  try { cached = JSON.parse(await Storage.getItem(CHECK) ?? 'null'); } catch { /* Retry without cache. */ }
  const age = Date.now() - (cached?.at ?? 0);
  let result: AppUpdate | undefined;
  if (!mode && !inFlight && cached?.installed === installed && age >= 0
    && age < (cached.ok ? CHECK_INTERVAL : RETRY_INTERVAL)) {
    result = newerAppUpdate(parseAppUpdates({ schemaVersion: 1, releases: cached.update ? [cached.update] : [] }), channel, nativeApplicationVersion, nativeBuildVersion);
  } else {
    if (!inFlight) {
      inFlight = (async () => {
        try {
          const manifest = await withApiRequestTimeout(async signal => {
            const response = await fetch(APP_UPDATE_MANIFEST_URL, { signal, cache: 'no-store' });
            if (!response.ok) throw new Error('update_check_unavailable');
            return response.json();
          }, undefined, mode === 'startup' ? 4000 : 8000);
          if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.releases)) throw new Error('invalid_update_manifest');
          const next = newerAppUpdate(parseAppUpdates(manifest), channel, nativeApplicationVersion, nativeBuildVersion);
          await Storage.setItem(CHECK, JSON.stringify({ installed, at: Date.now(), ok: true, update: next })).catch(() => undefined);
          return next;
        } catch (error) {
          await Storage.setItem(CHECK, JSON.stringify({ installed, at: Date.now(), ok: false })).catch(() => undefined);
          throw error;
        }
      })().finally(() => { inFlight = undefined; });
    }
    result = await inFlight;
  }
  if (!mode && result) {
    try {
      const saved = JSON.parse(await Storage.getItem(SNOOZED) ?? 'null');
      const elapsed = Date.now() - saved?.at;
      if (saved?.key === key(result) && elapsed >= 0 && elapsed < SNOOZE_INTERVAL) return undefined;
    } catch { /* A corrupt preference cannot hide an update. */ }
  }
  return result;
}

/** Only explicit dismissal snoozes; never mark a not-yet-shown prompt. */
export function dismissAppUpdate(update: AppUpdate) {
  return Storage.setItem(SNOOZED, JSON.stringify({ key: key(update), at: Date.now() }));
}
export async function openAppUpdate(update: AppUpdate) {
  await Linking.openURL(update.url);
}
