import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { downloadAndroidUpdate, installAndroidUpdate } from '../android-update.native';
import { installApk } from '../../../../modules/icao-app-installer/src';
import type { InstallableAppUpdate as AppUpdate } from '../android-update.native';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/', makeDirectoryAsync: jest.fn(async () => {}),
  readDirectoryAsync: jest.fn(async () => ['old.apk']), deleteAsync: jest.fn(async () => {}),
  createDownloadResumable: jest.fn(), getInfoAsync: jest.fn(),
}));
jest.mock('../../../../modules/icao-app-installer/src', () => ({ installApk: jest.fn() }));
const update: AppUpdate = { channel: 'android-apk', version: '1.2.1', build: 200, available: true,
  url: 'https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/app-200.apk',
  sha256: 'a'.repeat(64), sizeBytes: 100, notes: '更新', publishedAt: '2026-10-21T00:00:00Z' };
const uri = 'file:///cache/app-updates/android-apk-200.apk';
const originalOS = Platform.OS;
const download = jest.fn();
const cancel = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  download.mockResolvedValue({ status: 200, uri });
  cancel.mockResolvedValue(undefined);
  jest.mocked(FileSystem.createDownloadResumable).mockImplementation((_url, _uri, _opts, progress) => {
    progress?.({ totalBytesWritten: 50, totalBytesExpectedToWrite: 100 });
    return { downloadAsync: download, cancelAsync: cancel } as any;
  });
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, size: 100 } as any);
  jest.mocked(installApk).mockResolvedValue('installer-opened');
});
afterAll(() => Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }));
it('downloads privately with progress, removes old APKs and delegates verification to the native installer', async () => {
  const progress = jest.fn();
  expect(await downloadAndroidUpdate(update, progress, new AbortController().signal)).toBe(uri);
  expect(progress.mock.calls.map(([value]) => value)).toEqual([0.5, 1]);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/app-updates/old.apk', { idempotent: true });
  expect(await installAndroidUpdate(update, uri)).toBe('installer-opened');
  expect(installApk).toHaveBeenCalledWith(uri, '1.2.1', 200, 'a'.repeat(64));
});
it.each([404, 500])('never installs an HTTP %s response and cleans the partial download', async status => {
  download.mockResolvedValue({ status, uri });
  await expect(downloadAndroidUpdate(update, jest.fn(), new AbortController().signal)).rejects.toThrow();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
  expect(installApk).not.toHaveBeenCalled();
});
it('rejects a truncated download', async () => {
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, size: 20 } as any);
  await expect(downloadAndroidUpdate(update, jest.fn(), new AbortController().signal)).rejects.toThrow('incomplete');
});
it.each([{ url: 'https://evil.test/a.apk' }, { sha256: undefined }, { channel: 'ios-app-store' }])('rejects untrusted or unverifiable downloads: %j', async change => {
  await expect(downloadAndroidUpdate({ ...update, ...change } as AppUpdate, jest.fn(), new AbortController().signal)).rejects.toThrow('invalid_android_update');
  expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
});
it('cancels an active transfer and removes its partial file', async () => {
  let finish!: () => void;
  download.mockImplementation(() => new Promise(resolve => { finish = () => resolve(undefined); }));
  cancel.mockImplementation(async () => finish());
  const controller = new AbortController();
  const pending = downloadAndroidUpdate(update, jest.fn(), controller.signal);
  // Let directory preparation complete before cancelling the native transfer.
  while (!download.mock.calls.length) await Promise.resolve();
  controller.abort();
  await expect(pending).rejects.toThrow('cancelled');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
});
it('passes through permission requests and native checksum or signature rejection', async () => {
  jest.mocked(installApk).mockResolvedValueOnce('permission-required');
  expect(await installAndroidUpdate(update, uri)).toBe('permission-required');
  jest.mocked(installApk).mockRejectedValueOnce(new Error('update_signature_mismatch'));
  await expect(installAndroidUpdate(update, uri)).rejects.toThrow('signature_mismatch');
});
