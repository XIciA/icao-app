import { Platform } from 'react-native';
import { checkAppUpdate, dismissAppUpdate } from '../app-updates.native';

const mockStorage = new Map<string, string>();
const mockFetch = jest.fn();
let mockDistribution = 'sandbox';
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.1.2', nativeBuildVersion: '100' }));
jest.mock('@icao/distribution-environment', () => ({ getIcaoDistributionEnvironment: () => mockDistribution }));
jest.mock('@/platform/storage', () => ({ getItem: async (key: string) => mockStorage.get(key) ?? null, setItem: async (key: string, value: string) => { mockStorage.set(key, value); } }));
jest.mock('@/platform/api-client', () => ({ withApiRequestTimeout: (action: (signal: AbortSignal) => unknown) => action(new AbortController().signal) }));
const release = { channel: 'ios-testflight' as const, version: '1.1.3', build: 101, available: true as const, notes: '改进学习体验', publishedAt: '2026-09-23T00:00:00Z', url: 'https://testflight.apple.com/join/ABC123' };
const response = () => ({ ok: true, json: async () => ({ schemaVersion: 1, releases: [release] }) });
const originalFetch = global.fetch;
const originalOS = Platform.OS;
beforeEach(() => { mockStorage.clear(); mockFetch.mockReset().mockResolvedValue(response()); global.fetch = mockFetch; mockDistribution = 'sandbox'; Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' }); });
afterAll(() => { global.fetch = originalFetch; Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }); });
it('uses the installed distribution channel, throttles automatic checks, and lets manual checks through', async () => {
  expect(await checkAppUpdate()).toEqual(release);
  expect(await checkAppUpdate()).toEqual(release); expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(await checkAppUpdate(true)).toEqual(release);
  mockDistribution = 'production';
  expect(await checkAppUpdate(true)).toBeUndefined();
});
it('does not keep retrying an unavailable manifest on every foreground transition', async () => {
  mockFetch.mockRejectedValueOnce(new Error('offline'));
  await expect(checkAppUpdate()).rejects.toThrow('offline');
  expect(await checkAppUpdate()).toBeUndefined(); expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(await checkAppUpdate(true)).toEqual(release);
});
it('honours dismissal for automatic prompts while manual checks still offer that version', async () => {
  await dismissAppUpdate(release);
  expect(await checkAppUpdate()).toBeUndefined();
  expect(await checkAppUpdate(true)).toEqual(release);
});
it('shares an in-flight fetch and performs no native update checks on web', async () => {
  const [a, b] = await Promise.all([checkAppUpdate(true), checkAppUpdate(true)]);
  expect(a).toEqual(release); expect(b).toEqual(release); expect(mockFetch).toHaveBeenCalledTimes(1);
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  expect(await checkAppUpdate(true)).toBeUndefined(); expect(mockFetch).toHaveBeenCalledTimes(1);
});

it('retries a failed check after a short cooldown instead of waiting a day', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  try {
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(checkAppUpdate()).rejects.toThrow('offline');
    expect(await checkAppUpdate()).toBeUndefined();
    now.mockReturnValue(1_800_000_061_000);
    expect(await checkAppUpdate()).toEqual(release);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  } finally { now.mockRestore(); }
});
it('startup bypasses old permanent dismissals and current snoozes', async () => {
  mockStorage.set('icao.app-update.dismissed.v1', JSON.stringify({key:`${release.channel}:${release.version}:${release.build}`}));
  await dismissAppUpdate(release);
  expect(await checkAppUpdate('startup')).toEqual(release);
  expect(await checkAppUpdate()).toBeUndefined();
  expect(await checkAppUpdate('startup')).toEqual(release);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});
it('explicit dismissal expires and a different build is never hidden', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  try {
    await dismissAppUpdate(release);
    expect(await checkAppUpdate()).toBeUndefined();
    now.mockReturnValue(1_800_086_400_001);
    expect(await checkAppUpdate()).toEqual(release);
    await dismissAppUpdate(release);
    const next = {...release,build:102};
    mockFetch.mockResolvedValueOnce({ok:true,json:async()=>({schemaVersion:1,releases:[next]})});
    now.mockReturnValue(1_800_090_000_002);
    expect(await checkAppUpdate()).toEqual(next);
  } finally { now.mockRestore(); }
});
it('invalid manifests cannot become a successful cached no-update result', async () => {
  mockFetch.mockResolvedValueOnce({ok:true,json:async()=>({schemaVersion:2,releases:[]})});
  await expect(checkAppUpdate('startup')).rejects.toThrow('invalid_update_manifest');
  expect(await checkAppUpdate(true)).toEqual(release);
});
