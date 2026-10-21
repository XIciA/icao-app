import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { installApk } from '../../../modules/icao-app-installer/src';
import { parseAppUpdates, type AppUpdate } from './update-model';

export type InstallableAppUpdate = AppUpdate & { sha256?: string; sizeBytes?: number };

/** Only the existing manifest's APK allowlist may reach the downloader or installer. */
function validate(update: InstallableAppUpdate) {
  if (Platform.OS !== 'android' || !['android-apk', 'android-test'].includes(update.channel)
    || !parseAppUpdates({ schemaVersion: 1, releases: [update] }).length
    || !update.sha256 || !/^[a-f0-9]{64}$/u.test(update.sha256)) {
    throw new Error('invalid_android_update');
  }
}

let downloadActive = false;

export async function downloadAndroidUpdate(update: InstallableAppUpdate, onProgress: (progress: number) => void, signal: AbortSignal) {
  if (downloadActive) throw new Error('update_download_in_progress');
  downloadActive = true;
  try { return await downloadUpdate(update, onProgress, signal); }
  finally { downloadActive = false; }
}

async function downloadUpdate(update: InstallableAppUpdate, onProgress: (progress: number) => void, signal: AbortSignal) {
  validate(update);
  if (!FileSystem.cacheDirectory) throw new Error('update_storage_unavailable');
  const directory = `${FileSystem.cacheDirectory}app-updates/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  // Own only this cache directory. Old APKs must not accumulate on the device.
  for (const entry of await FileSystem.readDirectoryAsync(directory)) {
    await FileSystem.deleteAsync(`${directory}${entry}`, { idempotent: true });
  }
  if (signal.aborted) throw new Error('update_download_cancelled');
  const uri = `${directory}${update.channel}-${update.build}.apk`;
  const download = FileSystem.createDownloadResumable(update.url, uri, {}, progress => {
    const total = progress.totalBytesExpectedToWrite;
    if (total > 0 && !signal.aborted) onProgress(Math.min(1, progress.totalBytesWritten / total));
  });
  const cancel = () => { void download.cancelAsync().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const result = await download.downloadAsync();
    if (signal.aborted) throw new Error('update_download_cancelled');
    if (!result || result.status !== 200) throw new Error('update_download_failed');
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory || info.size <= 0
      || (update.sizeBytes !== undefined && info.size !== update.sizeBytes)) throw new Error('update_download_incomplete');
    onProgress(1);
    return uri;
  } catch (error) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}

export async function installAndroidUpdate(update: InstallableAppUpdate, uri: string) {
  validate(update);
  return installApk(uri, update.version, update.build, update.sha256!);
}
