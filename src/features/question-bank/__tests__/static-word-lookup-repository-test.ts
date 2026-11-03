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
