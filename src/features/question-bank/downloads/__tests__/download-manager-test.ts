import { prepareDownloads, downloadSnapshot, loadDownloadManifest, startDownload, cancelDownload, checkDownloadUpdates, deleteDownload } from '../download-manager.native';
import { AppState } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import type { OfflineManifest } from '@icao/contracts';
const mockValues = new Map<string, string>();
let mockAccount = 'a';
const mockRequest = jest.fn();
const mockNetwork = jest.fn();
const mockCache = jest.fn();
const mockPrepared = jest.fn();
const mockVerify = jest.fn();
const mockInvalidate = jest.fn(async () => undefined);
const mockRemove = jest.fn(async () => undefined);
jest.mock('@/platform/storage', () => ({ __esModule: true, default: {
  removeItem: async (key: string) => { mockValues.delete(key); },
  getItem: async (key: string) => mockValues.get(key) ?? null,
  setItem: async (key: string, value: string) => { mockValues.set(key, value); },
} }));
jest.mock('@/platform/api-client', () => ({ apiRequest: (...args: unknown[]) => mockRequest(...args) }));
jest.mock('@/platform/audio/audio-session-orchestrator', () => ({ audioSessionOrchestrator: { stopContentPlayback: jest.fn(async () => undefined) } }));
jest.mock('expo-network', () => ({ getNetworkStateAsync: () => mockNetwork(), NetworkStateType: { CELLULAR: 'CELLULAR' }, addNetworkStateListener: () => ({ remove() {} }) }));
jest.mock('expo-file-system', () => ({ Paths: { availableDiskSpace: 1e12 } }));
jest.mock('../../data/repository.native', () => ({ remoteQuestionBankRepository: { getDataset: jest.fn(async () => undefined) } }));
jest.mock('../../data/member-content-cache.native', () => ({
  currentQuestionBankContentAccountId: () => mockAccount, questionBankContentAccountGeneration: () => 1,
  invalidateOfflineResource: (...args: unknown[]) => (mockInvalidate as Function)(...args), invalidateOfflineTopic: jest.fn(),
  offlineCredentialNeedsRefresh: async () => false, renewOfflineCredentials: jest.fn(),
  offlineResourcePrepared: (...args: unknown[]) => mockPrepared(...args),
  cacheMemberResource: (...args: unknown[]) => mockCache(...args),
  verifyOfflineResource: (...args: unknown[]) => mockVerify(...args),
  removeOfflineResources: (...args: unknown[]) => (mockRemove as Function)(...args),
}));
const manifest = (scope: 'selected' | 'all' = 'selected'): OfflineManifest => ({ bankId: 'listening', scope, version: 1, checksum: 'a'.repeat(64), fingerprint: scope, sizeBytes: 100,
  topics: [], resources: [{ publicPath: '/one.mp3', checksum: 'a'.repeat(64), sizeBytes: 100 }] });
let iteration = 0;
beforeEach(async () => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  mockAccount = `account-${++iteration}`; mockValues.clear(); mockRequest.mockReset(); mockInvalidate.mockClear(); mockRemove.mockClear();
  mockCache.mockReset().mockResolvedValue('file:sealed'); mockPrepared.mockReset().mockResolvedValue(false); mockVerify.mockReset().mockResolvedValue(true);
  mockNetwork.mockResolvedValue({ isConnected: false }); await prepareDownloads();
});
test('interrupted expansion preserves the saved subset and cancellation preserves recovery state', async () => {
  mockAccount += '-saved';
  mockValues.set(`icao.downloads.v1.${mockAccount}.production`, JSON.stringify({ listening: { phase: 'idle', saved: manifest(), completed: 1, total: 1 } }));
  await prepareDownloads(); await startDownload(manifest('all'));
  await waitFor(() => expect(downloadSnapshot().listening?.phase).toBe('paused'));
  expect(downloadSnapshot().listening?.saved?.scope).toBe('selected');
  expect(downloadSnapshot().listening?.target?.scope).toBe('all');
  await cancelDownload('listening');
  expect(downloadSnapshot().listening?.saved?.scope).toBe('selected');
});
test('known changed resource is invalidated; a failed check never invalidates another resource', async () => {
  mockAccount += '-saved';
  mockValues.set(`icao.downloads.v1.${mockAccount}.production`, JSON.stringify({ listening: { phase: 'idle', saved: manifest() } }));
  await prepareDownloads(); mockNetwork.mockResolvedValue({ isConnected: true });
  mockRequest.mockResolvedValue({ ...manifest(), fingerprint: 'new', resources: [{ ...manifest().resources[0], checksum: 'b'.repeat(64) }] });
  expect(await checkDownloadUpdates()).toBe('1 项有更新');
  expect(mockInvalidate).toHaveBeenCalledWith('/one.mp3', 'a'.repeat(64));
  mockInvalidate.mockClear(); mockRequest.mockRejectedValue(new Error('offline'));
  expect(await checkDownloadUpdates()).toBe('检查失败'); expect(mockInvalidate).not.toHaveBeenCalled();
  expect(downloadSnapshot().listening?.outdated).toBe(true);
});
test('late manifest is rejected after account switch, even before another page mounts', async () => {
  let done!: (value: OfflineManifest) => void;
  mockRequest.mockReturnValue(new Promise(resolve => { done = resolve; }));
  const loading = loadDownloadManifest('listening', 'selected');
  await waitFor(() => expect(mockRequest).toHaveBeenCalled());
  mockAccount = 'different'; done(manifest());
  await expect(loading).rejects.toThrow('账号已切换');
});
test('deletion removes package data without touching any personal storage', async () => {
  mockAccount += '-saved';
  mockValues.set(`icao.downloads.v1.${mockAccount}.production`, JSON.stringify({ listening: { phase: 'idle', saved: manifest() } }));
  mockValues.set('notes', 'keep'); await prepareDownloads();
  await deleteDownload('listening');
  expect(downloadSnapshot().listening).toBeUndefined(); expect(mockValues.get('notes')).toBe('keep');
  expect(mockRemove).toHaveBeenCalledWith(['/one.mp3'], []);
});

test('successful package verifies files, persists its manifest separately and reaches completed state', async () => {
  mockNetwork.mockResolvedValue({ isConnected: true, type: 'WIFI' });
  mockRequest.mockImplementation(async (url: string) => url.includes('resolve-batch')
    ? [{ ...manifest().resources[0], url: 'https://media.test/one', expiresIn: 300 }] : manifest());
  mockCache.mockImplementation(async () => { mockPrepared.mockResolvedValue(true); return 'file:sealed'; });
  await startDownload(manifest());
  await waitFor(() => expect(downloadSnapshot().listening?.saved).toBeDefined());
  expect(mockVerify).toHaveBeenCalledWith('/one.mp3', manifest().resources[0]);
  expect(downloadSnapshot().listening?.target).toBeUndefined();
  expect(downloadSnapshot().listening?.phase).toBe('idle');
  await waitFor(() => expect(downloadSnapshot().listening?.latest).toBeDefined());
  const raw = JSON.parse(mockValues.get(`icao.downloads.v1.${mockAccount}.production`)!);
  expect(typeof raw.listening.saved).toBe('string');
  expect(JSON.parse(mockValues.get(raw.listening.saved)!)).toEqual(manifest());
});
test('resume fetches the latest manifest before signing any resource', async () => {
  mockNetwork.mockResolvedValue({ isConnected: true, type: 'WIFI' });
  const updated = { ...manifest(), version: 2, checksum: 'c'.repeat(64), fingerprint: 'new', resources: [{ ...manifest().resources[0], checksum: 'b'.repeat(64) }] };
  mockRequest.mockImplementation(async (url: string) => url.includes('resolve-batch')
    ? [{ ...updated.resources[0], url: 'https://media.test/new', expiresIn: 300 }] : updated);
  mockCache.mockImplementation(async () => { mockPrepared.mockResolvedValue(true); return 'file:sealed'; });
  await startDownload(manifest());
  await waitFor(() => expect(downloadSnapshot().listening?.saved?.version).toBe(2));
  expect(mockCache.mock.calls[0][2].checksum).toBe('b'.repeat(64));
  await waitFor(() => expect(downloadSnapshot().listening?.latest).toBeDefined());
});
test('cancel while the manifest refresh is pending cannot write content or restore the task', async () => {
  mockNetwork.mockResolvedValue({ isConnected: true, type: 'WIFI' });
  let resolve!: (value: OfflineManifest) => void;
  mockRequest.mockReturnValue(new Promise(done => { resolve = done; }));
  await startDownload(manifest());
  await waitFor(() => expect(mockRequest).toHaveBeenCalled());
  await cancelDownload('listening'); resolve(manifest());
  await new Promise(done => setTimeout(done, 20));
  expect(mockCache).not.toHaveBeenCalled();
  expect(downloadSnapshot().listening?.phase).toBe('paused');
  expect(downloadSnapshot().listening?.saved).toBeUndefined();
});
