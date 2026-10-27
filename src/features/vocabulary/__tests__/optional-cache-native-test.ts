import Storage from '@/platform/storage';
import { apiFetch } from '@/platform/api-client';
import { releaseFixture } from '../test-support/live-fixture';
import { loadVocabulary } from '../repository.native';
import { loadResourceEditorial } from '@/features/editorial/repository.native';
jest.mock('expo-crypto',()=>({CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(_type:string,text:string)=>jest.requireActual('node:crypto').createHash('sha256').update(text).digest('hex')}));
const release=releaseFixture(),dataset=release.dataset;
jest.mock('@/platform/api-client', () => ({ getApiBaseUrl: () => 'https://test.invalid', apiFetch: jest.fn() }));
jest.mock('@/platform/storage', () => ({ __esModule: true, default: { getItem: jest.fn(), setItem: jest.fn() } }));
beforeEach(() => { jest.clearAllMocks(); jest.mocked(Storage.getItem).mockResolvedValue(null); jest.mocked(Storage.setItem).mockResolvedValue(); });
it.each(['read', 'write'])('keeps online vocabulary usable when optional cache %s fails', async mode => {
  if (mode === 'read') jest.mocked(Storage.getItem).mockRejectedValue(new Error('disk'));
  else jest.mocked(Storage.setItem).mockRejectedValue(new Error('disk'));
  jest.mocked(apiFetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: release }) } as Response);
  await expect(loadVocabulary()).resolves.toMatchObject({ source: 'remote', dataset });
});
it('keeps a valid article list when both optional cache operations fail', async () => {
  jest.mocked(Storage.getItem).mockRejectedValue(new Error('disk'));
  jest.mocked(Storage.setItem).mockRejectedValue(new Error('disk'));
  const data = { version: 1, checksum: 'a'.repeat(64), items: [] };
  jest.mocked(apiFetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ data }) } as Response);
  await expect(loadResourceEditorial()).resolves.toMatchObject({ source: 'remote', data });
});
