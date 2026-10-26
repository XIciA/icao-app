import Storage from '@/platform/storage';
import { apiFetch } from '@/platform/api-client';
import catalog from '../../../../content/vocabulary/three-books/dataset.json';
import { loadVocabulary } from '../catalog-loader';

let mockBase = 'https://test.invalid';
jest.mock('@/platform/api-client', () => ({ getApiBaseUrl: () => mockBase, apiFetch: jest.fn() }));
jest.mock('@/platform/storage', () => ({ __esModule: true, default: { getItem: jest.fn(), setItem: jest.fn() } }));
const cached = { version: 3, checksum: 'a'.repeat(64), dataset: catalog };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const response = (data = cached) => ({ ok: true, status: 200, json: async () => ({ data }) }) as Response;
beforeEach(() => {
  jest.clearAllMocks(); mockBase = 'https://test.invalid';
  jest.mocked(Storage.getItem).mockResolvedValue(JSON.stringify(cached));
  jest.mocked(Storage.setItem).mockResolvedValue();
});

it('shows cache before a stalled request and shares refresh across screens, then releases the request', async () => {
  const gate = deferred<Response>(); const refreshed = jest.fn();
  jest.mocked(apiFetch).mockReturnValue(gate.promise);
  expect(await loadVocabulary({ preferCache: true, onRefresh: refreshed })).toMatchObject({ source: 'cache' });
  await loadVocabulary({ preferCache: true });
  expect(apiFetch).toHaveBeenCalledTimes(1); expect(refreshed).not.toHaveBeenCalled();
  gate.resolve(response()); await flush();
  expect(refreshed).toHaveBeenCalledWith({ dataset: catalog, source: 'remote' });
  expect(Storage.setItem).toHaveBeenCalledTimes(1);
  expect(jest.mocked(Storage.setItem).mock.calls[0][0]).toContain('icao.content.v2.vocabulary.');
  await loadVocabulary(); expect(apiFetch).toHaveBeenCalledTimes(2);
});
it('retains network-first compatibility and waits for valid content when no cache exists', async () => {
  const gate = deferred<Response>(); let settled = false;
  jest.mocked(apiFetch).mockReturnValue(gate.promise);
  const first = loadVocabulary().then(result => { settled = true; return result; });
  await flush(); expect(settled).toBe(false);
  gate.resolve(response()); expect((await first).source).toBe('remote');
  jest.mocked(Storage.getItem).mockResolvedValue('{broken');
  jest.mocked(apiFetch).mockRejectedValue(new Error('offline'));
  await expect(loadVocabulary({ preferCache: true })).rejects.toThrow('offline');
});
it('rejects an invalid refresh without overwriting the valid cache or learning data', async () => {
  jest.mocked(apiFetch).mockResolvedValue(response({ ...cached, checksum: 'invalid' }));
  const refreshed = jest.fn();
  await loadVocabulary({ preferCache: true, onRefresh: refreshed }); await flush();
  expect(refreshed).toHaveBeenCalledWith(expect.objectContaining({ source: 'cache', warning: 'vocabulary_remote_unavailable' }));
  expect(Storage.setItem).not.toHaveBeenCalled();
});
it('does not apply late content from another API origin', async () => {
  const gate = deferred<Response>(); const refreshed = jest.fn();
  jest.mocked(apiFetch).mockReturnValue(gate.promise);
  await loadVocabulary({ preferCache: true, onRefresh: refreshed });
  mockBase = 'https://other.invalid'; gate.resolve(response()); await flush();
  expect(refreshed).not.toHaveBeenCalled(); expect(Storage.setItem).not.toHaveBeenCalled();
});
it('imports the legacy cache only for the production origin', async () => {
  jest.mocked(Storage.getItem).mockImplementation(async key => key === 'icao.content.v1.vocabulary' ? JSON.stringify(cached) : null);
  jest.mocked(apiFetch).mockRejectedValue(new Error('offline'));
  await expect(loadVocabulary()).rejects.toThrow('offline');
  mockBase = 'https://api.readyoufife.com';
  expect((await loadVocabulary()).source).toBe('cache');
});
