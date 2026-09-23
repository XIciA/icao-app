import { nativeApplicationVersion, nativeBuildVersion } from 'expo-application';
import { getIcaoDistributionEnvironment } from '@icao/distribution-environment';
import { Linking, Platform } from 'react-native';
import Storage from '@/platform/storage';
import { withApiRequestTimeout } from '@/platform/api-client';
import { APP_UPDATE_MANIFEST_URL, newerAppUpdate, parseAppUpdates, type AppUpdate } from './update-model';

const LAST_CHECK = 'icao.app-update.last-check.v1';
const DISMISSED = 'icao.app-update.dismissed.v1';
let inFlight: Promise<AppUpdate | undefined> | undefined;
export async function checkAppUpdate(manual = false): Promise<AppUpdate | undefined> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return undefined;
  if (!manual && !inFlight && Date.now() - Number(await Storage.getItem(LAST_CHECK)) < 24 * 60 * 60 * 1000) return undefined;
  const channel = Platform.OS === 'android' ? 'android-apk' : getIcaoDistributionEnvironment() === 'sandbox' ? 'ios-testflight' : 'ios-app-store';
  if (!inFlight) {
    inFlight = (async () => {
      // Also throttle unsuccessful automatic attempts; manual checks always retry.
      await Storage.setItem(LAST_CHECK, String(Date.now()));
      const response = await withApiRequestTimeout((signal) => fetch(APP_UPDATE_MANIFEST_URL, { signal, cache: 'no-store' }), undefined, 8000);
      if (!response.ok) throw new Error('update_check_unavailable');
      const result = newerAppUpdate(parseAppUpdates(await response.json()), channel, nativeApplicationVersion, nativeBuildVersion);
      return result;
    })().finally(() => { inFlight = undefined; });
  }
  const result = await inFlight;
  if (!manual && result) {
    const dismissed = await Storage.getItem(DISMISSED);
    if (dismissed) {
      try { const saved = JSON.parse(dismissed); if (saved.key === `${result.channel}:${result.version}:${result.build}` && Date.now() - saved.time < 7 * 24 * 60 * 60 * 1000) return undefined; } catch { /* A corrupt preference must not block manual updates. */ }
    }
  }
  return result;
}
export function dismissAppUpdate(update: AppUpdate) {
  return Storage.setItem(DISMISSED, JSON.stringify({ key: `${update.channel}:${update.version}:${update.build}`, time: Date.now() }));
}
export async function openAppUpdate(update: AppUpdate) {
  await Linking.openURL(update.url);
}
