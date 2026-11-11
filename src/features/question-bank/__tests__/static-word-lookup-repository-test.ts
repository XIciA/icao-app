import { apiFetch } from '@/platform/api-client';
import storage from '@/platform/storage';
import { refreshStaticWordLookup, subscribeStaticWordLookup } from '../static-word-lookup/repository';
import { findStaticWordLookup, hasStaticWordLookup } from '../static-word-lookup/repository';

describe('static word lookup repository', () => {
  it('returns the approved local descent entry with a single US IPA', () => {
    expect(findStaticWordLookup('descent,')).toEqual({
      word: 'descent',
      ipa: '/dɪˈsent/',
      aviationMeaning: 'n. 下降',
      generalMeaning: 'n. 斜坡；恶化；沦落；血统',
    });
    expect(hasStaticWordLookup('A320')).toBe(false);
  });
});

jest.mock('@/platform/api-client', () => ({ apiFetch: jest.fn(), getApiBaseUrl: () => 'https://dictionary.test' }));
jest.mock('@/platform/storage', () => ({ __esModule: true, default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) } }));

it('refreshes definitions, persists them for offline startup, and retains the bundle after an older API response', async () => {
  const changed = jest.fn(); const unsubscribe = subscribeStaticWordLookup(changed);
  const entry = { word: 'newword', ipa: '/njuːwɜːd/', aviationMeaning: 'n. 测试新增词', generalMeaning: 'n. 测试新增词' };
  jest.mocked(apiFetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
  await refreshStaticWordLookup();
  expect(findStaticWordLookup('descent')).toBeDefined();
  jest.mocked(apiFetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { checksum: 'a'.repeat(64), entries: [entry] } }) } as Response);
  await refreshStaticWordLookup();
  expect(findStaticWordLookup('newword')).toEqual(entry);
  expect(storage.setItem).toHaveBeenCalledWith(expect.stringContaining('https://dictionary.test'), expect.stringContaining('newword'));
  expect(changed).toHaveBeenCalledTimes(1);
  expect(findStaticWordLookup('descent')).toBeDefined();
  unsubscribe();
});

it('restores a downloaded definition after restart without network access', async () => {
  let cached: string | null = null;
  const entry = { word: 'offlineflightword', ipa: '/flaɪt/', aviationMeaning: 'n. 离线测试词', generalMeaning: 'n. 离线测试词' };
  jest.mocked(storage.getItem).mockImplementation(async () => cached);
  jest.mocked(storage.setItem).mockImplementation(async (_key, value) => { cached = typeof value === 'string' ? value : null; });
  jest.mocked(apiFetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { checksum: 'b'.repeat(64), entries: [entry] } }) } as Response);
  await refreshStaticWordLookup();
  expect(cached).toContain('offlineflightword');
  let restarted!: typeof import('../static-word-lookup/repository');
  jest.isolateModules(() => { restarted = require('../static-word-lookup/repository'); });
  expect(restarted.findStaticWordLookup('offlineflightword')).toBeUndefined();
  jest.mocked(apiFetch).mockRejectedValueOnce(new Error('offline'));
  await restarted.refreshStaticWordLookup();
  expect(restarted.findStaticWordLookup('offlineflightword')).toEqual(entry);
  expect(restarted.findStaticWordLookup('descent')).toBeDefined();
});
