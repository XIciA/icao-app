import { observeDownloadRuntime, prepareDownloads, downloadSnapshot, loadDownloadManifest, startDownload, cancelDownload, checkDownloadUpdates, deleteDownload } from '../download-manager.native';
import { AppState } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import type { OfflineManifest } from '@icao/contracts';
jest.mock('@/features/vocabulary/offline-content.native', () => ({ prepareVocabularyDownload: jest.fn(async () => undefined), verifyVocabularyDownload: jest.fn(async () => undefined) }));
jest.mock('@/features/vocabulary/speech.native', () => ({ stopVocabularySpeech: jest.fn(async () => undefined) }));
const mockValues = new Map<string, string>();
let mockAccount = 'a';
const mockRequest = jest.fn();
const mockNetwork = jest.fn();
const mockNetworkListeners = new Set<(value: any) => void>();
let mockStorageFail = false;
const mockCache = jest.fn();
const mockPrepared = jest.fn();
const mockVerify = jest.fn();
const mockInvalidate = jest.fn(async () => undefined);
const mockRemove = jest.fn(async () => undefined);
jest.mock('@/platform/storage', () => ({ __esModule: true, default: {
  removeItem: async (key: string) => { mockValues.delete(key); },
  getItem: async (key: string) => mockValues.get(key) ?? null,
  setItem: async (key: string, value: string) => { if (mockStorageFail) throw new Error('storage_failed'); mockValues.set(key, value); },
} }));
jest.mock('@/platform/api-client', () => ({ apiRequest: (...args: unknown[]) => mockRequest(...args) }));
jest.mock('@/platform/audio/audio-session-orchestrator', () => ({ audioSessionOrchestrator: { stopContentPlayback: jest.fn(async () => undefined) } }));
jest.mock('expo-network', () => ({ getNetworkStateAsync: () => mockNetwork(), NetworkStateType: { CELLULAR: 'CELLULAR' }, addNetworkStateListener: (listener: (value: any) => void) => { mockNetworkListeners.add(listener); return { remove() { mockNetworkListeners.delete(listener); } }; } }));
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
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove() {} }));
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  mockStorageFail = false; mockNetworkListeners.clear(); mockAccount = `account-${++iteration}`; mockValues.clear(); mockRequest.mockReset(); mockInvalidate.mockClear(); mockRemove.mockClear();
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

test('three vocabulary books use independent packages, public audio and shared deletion protection', async () => {
  mockNetwork.mockResolvedValue({ isConnected: true, type: 'WIFI' });
  const book = (scope: 'preview' | 'icao4'): OfflineManifest => ({ ...manifest(), bankId: 'vocabulary', scope, fingerprint: scope,
    vocabulary: { bookId: scope, wordChecksums: { [scope]: 'a'.repeat(64) } },
    resources: [{ ...manifest().resources[0], publicPath: `/pronunciation-assets/${'b'.repeat(64)}.mp3` }] });
  mockRequest.mockImplementation(async (url: string) => url.includes('resolve-batch')
    ? [{ ...book('preview').resources[0], url: 'https://media.test/word', expiresIn: 300 }]
    : book(url.endsWith('icao4') ? 'icao4' : 'preview'));
  mockCache.mockImplementation(async () => { mockPrepared.mockResolvedValue(true); return 'file:sealed'; });
  await startDownload(book('preview'));
  await waitFor(() => expect(downloadSnapshot()['vocabulary:preview']?.latest).toBeDefined());
  await startDownload(book('icao4'));
  await waitFor(() => expect(downloadSnapshot()['vocabulary:icao4']?.latest).toBeDefined());
  expect(mockCache).toHaveBeenCalledWith(book('preview').resources[0].publicPath, expect.any(String), expect.any(Object), expect.objectContaining({ publicDownload: true, required: true }));
  expect(mockRequest.mock.calls.some(([url]) => url.includes('credentials'))).toBe(false);
  await deleteDownload('vocabulary:preview');
  expect(downloadSnapshot()['vocabulary:preview']).toBeUndefined();
  expect(downloadSnapshot()['vocabulary:icao4']?.saved?.scope).toBe('icao4');
  expect(mockRemove).toHaveBeenLastCalledWith([], []);
  await deleteDownload('vocabulary:icao4');
  expect(mockRemove).toHaveBeenLastCalledWith([book('preview').resources[0].publicPath], []);
});

test('an update check started by the old account never invalidates the new account package', async () => {
  mockAccount += '-saved';
  mockValues.set(`icao.downloads.v1.${mockAccount}.production`, JSON.stringify({ listening: { phase: 'idle', saved: manifest() } }));
  await prepareDownloads(); mockNetwork.mockResolvedValue({ isConnected: true });
  let resolve!: (value: OfflineManifest) => void;
  mockRequest.mockReturnValue(new Promise(done => { resolve = done; }));
  const checking = checkDownloadUpdates();
  const rejected = expect(checking).rejects.toThrow('账号已切换');
  await waitFor(() => expect(mockRequest).toHaveBeenCalled());
  mockAccount += '-other';
  mockValues.set(`icao.downloads.v1.${mockAccount}.production`, JSON.stringify({ listening: { phase: 'idle', saved: manifest('all') } }));
  await prepareDownloads(); resolve(manifest()); await rejected;
  expect(mockInvalidate).not.toHaveBeenCalled();
  expect(downloadSnapshot().listening?.saved?.scope).toBe('all');
});

test('a word removed from one book does not invalidate audio still published in another downloaded book', async () => {
  mockAccount += '-shared';
  const book = (scope: 'preview' | 'icao4'): OfflineManifest => ({ ...manifest(), bankId: 'vocabulary', scope, fingerprint: scope,
    vocabulary: { bookId: scope, wordChecksums: { shared: 'a'.repeat(64) } } });
  mockValues.set(`icao.downloads.v1.${mockAccount}.production`, JSON.stringify({
    'vocabulary:preview': { phase: 'idle', saved: book('preview') }, 'vocabulary:icao4': { phase: 'idle', saved: book('icao4') },
  }));
  await prepareDownloads(); mockNetwork.mockResolvedValue({ isConnected: true }); mockPrepared.mockResolvedValue(true);
  mockRequest.mockImplementation(async (url: string) => url.endsWith('preview')
    ? { ...book('preview'), fingerprint: 'removed', resources: [], vocabulary: { bookId: 'preview', wordChecksums: {} } } : book('icao4'));
  expect(await checkDownloadUpdates()).toBe('1 项有更新');
  expect(mockInvalidate).not.toHaveBeenCalled();
  expect(downloadSnapshot()['vocabulary:icao4']?.outdated).toBe(false);
});

function multiManifest() {
  return { ...manifest(), sizeBytes: 1000, resources: [100, 200, 300, 400].map((sizeBytes, index) => ({ ...manifest().resources[0], publicPath: `/file-${index}.mp3`, sizeBytes })) };
}
function prepareMulti() {
  const value = multiManifest();
  mockNetwork.mockResolvedValue({ isConnected: true, type: 'WIFI' });
  mockRequest.mockImplementation(async (url: string) => url.includes('resolve-batch')
    ? value.resources.map(resource => ({ ...resource, url: `https://media.test${resource.publicPath}`, expiresIn: 300 })) : value);
  return value;
}
test('downloads bounded resources concurrently and reports bytes before any resource finishes', async () => {
  const value = prepareMulti();
  const held: { finish(): void; options: any }[] = [];
  mockCache.mockImplementation((_path, _url, _metadata, options) => new Promise(resolve => { held.push({ finish: () => resolve('file:sealed'), options }); }));
  await startDownload(value); await waitFor(() => expect(held).toHaveLength(4));
  held[0].options.onProgress(0.5); // 50 bytes out of 1000, not 1/4 files.
  expect(downloadSnapshot().listening?.downloadedBytes).toBe(50);
  expect(downloadSnapshot().listening?.completed).toBe(0);
  held[0].finish(); held[1].finish(); await waitFor(() => expect(downloadSnapshot().listening?.completed).toBe(2));
  expect(downloadSnapshot().listening?.downloadedBytes).toBe(300);
  held[2].finish(); held[3].finish();
  await waitFor(() => expect(downloadSnapshot().listening?.saved).toBeDefined());
  expect(mockVerify).toHaveBeenCalledTimes(4); expect(downloadSnapshot().listening?.downloadedBytes).toBe(1000);
  await waitFor(() => expect(downloadSnapshot().listening?.latest).toBeDefined());
});
test('one failed worker stops dispatch and waits for siblings; their late progress cannot revive the package', async () => {
  const value = prepareMulti();
  const held: { finish(): void; fail(): void; options: any }[] = [];
  mockCache.mockImplementation((_path, _url, _metadata, options) => new Promise((resolve, reject) => {
    held.push({ finish: () => resolve('file:sealed'), fail: () => reject(new Error('network_interrupted')), options });
  }));
  await startDownload(value); await waitFor(() => expect(held).toHaveLength(4)); held[0].fail();
  await waitFor(() => expect(held[1].options.isCurrent()).toBe(false));
  held[1].options.onProgress(1); expect(downloadSnapshot().listening?.downloadedBytes ?? 0).toBe(0);
  expect(mockVerify).not.toHaveBeenCalled(); held.slice(1).forEach(task => task.finish());
  await waitFor(() => expect(downloadSnapshot().listening?.phase).toBe('paused'));
  expect(held).toHaveLength(4); expect(downloadSnapshot().listening?.saved).toBeUndefined();
});
test('cancel then immediate resume waits for old workers and does not accept their completion', async () => {
  const value = prepareMulti(); const held: { finish(): void; options: any }[] = [];
  mockCache.mockImplementation((_path, _url, _metadata, options) => new Promise(resolve => { held.push({ finish: () => resolve('file:sealed'), options }); }));
  await startDownload(value); await waitFor(() => expect(held).toHaveLength(4));
  await cancelDownload('listening'); await startDownload(value);
  expect(downloadSnapshot().listening?.phase).toBe('queued');
  expect(held[0].options.isCurrent()).toBe(false); held[0].options.onProgress(1);
  expect(downloadSnapshot().listening?.downloadedBytes ?? 0).toBe(0);
  held.forEach(task => task.finish()); await waitFor(() => expect(held).toHaveLength(8));
  expect(downloadSnapshot().listening?.saved).toBeUndefined();
  await cancelDownload('listening'); held.slice(4).forEach(task => task.finish());
  await new Promise(resolve => setTimeout(resolve, 20)); expect(mockVerify).not.toHaveBeenCalled();
});
test('switching account while workers run ignores old progress and completion', async () => {
  const value = prepareMulti(); const held: { finish(): void; options: any }[] = [];
  mockCache.mockImplementation((_path, _url, _metadata, options) => new Promise(resolve => { held.push({ finish: () => resolve('file:sealed'), options }); }));
  await startDownload(value); await waitFor(() => expect(held).toHaveLength(4));
  mockAccount += '-new'; await prepareDownloads();
  held.forEach(task => { task.options.onProgress(1); task.finish(); });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(downloadSnapshot()).toEqual({}); expect(mockVerify).not.toHaveBeenCalled();
});

test('reused files do not transfer again and final integrity failure never marks the package complete', async () => {
  const value = prepareMulti();
  mockPrepared.mockImplementation(async path => path === value.resources[0].publicPath);
  mockVerify.mockImplementation(async path => path !== value.resources[0].publicPath);
  await startDownload(value); await waitFor(() => expect(downloadSnapshot().listening?.phase).toBe('paused'));
  expect(mockCache).toHaveBeenCalledTimes(3); expect(downloadSnapshot().listening?.saved).toBeUndefined();
  expect(downloadSnapshot().listening?.target).toEqual(value);
});

test('concurrent workers renew an expired signature batch once before downloading remaining files', async () => {
  const value = prepareMulti();
  value.resources.push(...value.resources.map(r => ({ ...r, publicPath: r.publicPath + '.extra' })));
  const clock = jest.spyOn(Date, 'now'); const originalNow = Date.now(); let elapsed = 0;
  clock.mockImplementation(() => originalNow + elapsed);
  let count = 0;
  mockCache.mockImplementation(async () => { if (++count === 2) elapsed = 301000; return 'file:sealed'; });
  try {
    await startDownload(value); await waitFor(() => expect(downloadSnapshot().listening?.latest).toBeDefined());
    expect(mockCache).toHaveBeenCalledTimes(8);
    expect(mockRequest.mock.calls.filter(([url]) => url.includes('resolve-batch'))).toHaveLength(2);
  } finally { clock.mockRestore(); }
});

function emitNetwork(value: any) {
  mockNetwork.mockResolvedValue(value);
  for (const listener of [...mockNetworkListeners]) listener(value);
}

test('app runtime resumes network interruption after screen subscriptions leave; user pause stays paused', async () => {
  const value = prepareMulti();
  const stop = observeDownloadRuntime();
  const held: { finish(): void; options: any }[] = [];
  mockCache.mockImplementation((_path, _url, _metadata, options) => new Promise(resolve => { held.push({ finish: () => resolve('file:sealed'), options }); }));
  try {
    await startDownload(value); await waitFor(() => expect(held).toHaveLength(4));
    emitNetwork({ isConnected: false });
    await waitFor(() => expect(downloadSnapshot().listening?.error).toBe('等待网络'));
    expect(downloadSnapshot().listening?.autoResume).toBe(true);
    held.forEach(task => task.finish());
    emitNetwork({ isConnected: true, type: 'WIFI' });
    await waitFor(() => expect(held).toHaveLength(8));
    await cancelDownload('listening');
    held.slice(4).forEach(task => task.finish());
    emitNetwork({ isConnected: false }); emitNetwork({ isConnected: true, type: 'WIFI' });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(held).toHaveLength(8);
    expect(downloadSnapshot().listening?.autoResume).toBe(false);
  } finally { stop(); }
});

test('inactive does not pause downloads, background pauses and active resumes', async () => {
  const value = prepareMulti(); let onState!: (value: import('react-native').AppStateStatus) => void;
  const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { onState = callback; return { remove() {} }; });
  const held: { finish(): void; options: any }[] = [];
  mockCache.mockImplementation((_path, _url, _metadata, options) => new Promise(resolve => { held.push({ finish: () => resolve('file:sealed'), options }); }));
  const stop = observeDownloadRuntime();
  try {
    await startDownload(value); await waitFor(() => expect(held).toHaveLength(4));
    onState('inactive'); expect(downloadSnapshot().listening?.phase).toBe('downloading');
    onState('background'); expect(downloadSnapshot().listening?.phase).toBe('paused');
    held.forEach(task => task.finish()); onState('active');
    await waitFor(() => expect(held).toHaveLength(8));
    await cancelDownload('listening'); held.slice(4).forEach(task => task.finish());
    await new Promise(resolve => setTimeout(resolve, 20));
  } finally { stop(); listener.mockRestore(); }
});

test('cold restart restores automatic task intent but never a manually paused package', async () => {
  const value = prepareMulti(); mockAccount += '-restart';
  mockValues.set("icao.downloads.v1." + mockAccount + ".production", JSON.stringify({
    listening: { phase: 'downloading', target: value },
    storytelling: { phase: 'paused', target: { ...value, bankId: 'storytelling' }, autoResume: false },
  }));
  const stop = observeDownloadRuntime();
  try {
    await waitFor(() => expect(downloadSnapshot().listening?.saved).toBeDefined());
    expect(downloadSnapshot().storytelling?.phase).toBe('paused');
    expect(mockRequest.mock.calls.some(([url]) => url.includes('storytelling'))).toBe(false);
    await waitFor(() => expect(downloadSnapshot().listening?.latest).toBeDefined());
  } finally { stop(); }
});

test('storage failure of one task does not mark a completed package failed', async () => {
  mockAccount += '-storage';
  mockValues.set("icao.downloads.v1." + mockAccount + ".production", JSON.stringify({ storytelling: { phase: 'idle', saved: { ...manifest(), bankId: 'storytelling' } } }));
  await prepareDownloads(); mockStorageFail = true;
  await expect(startDownload(manifest())).rejects.toThrow('storage_failed');
  expect(downloadSnapshot().listening?.phase).toBe('error');
  expect(downloadSnapshot().storytelling?.phase).toBe('idle');
  expect(downloadSnapshot().storytelling?.saved).toBeDefined();
  mockStorageFail = false;
});

test('newly verified files skip duplicate final hashing; reused files still verify', async () => {
  const value = prepareMulti();
  mockPrepared.mockImplementation(async path => path === value.resources[0].publicPath);
  mockCache.mockImplementation(async (_path, _url, _metadata, options) => { options.onVerified(); return 'file:sealed'; });
  await startDownload(value);
  await waitFor(() => expect(downloadSnapshot().listening?.latest).toBeDefined());
  expect(mockCache).toHaveBeenCalledTimes(3);
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockVerify).toHaveBeenCalledWith(value.resources[0].publicPath, value.resources[0]);
});

test('a failed package does not stop the next queued bank', async () => {
  const first = prepareMulti();
  const next = { ...first, bankId: 'storytelling', resources: [{ ...first.resources[0], publicPath: '/story.mp3' }] } as OfflineManifest;
  mockRequest.mockImplementation(async (url: string, options: any) => {
    if (url.includes('resolve-batch')) return JSON.parse(options.body).resources.map((resource: any) => ({ ...resource, sizeBytes: 100, url: 'https://test/audio', expiresIn: 300 }));
    return url.includes('storytelling') ? next : first;
  });
  mockCache.mockImplementation(async path => { if (path !== '/story.mp3') throw new Error('resource_checksum_mismatch'); return 'file:sealed'; });
  await startDownload(first); await startDownload(next);
  await waitFor(() => expect(downloadSnapshot().storytelling?.latest).toBeDefined());
  expect(downloadSnapshot().listening?.phase).toBe('paused');
  expect(downloadSnapshot().listening?.saved).toBeUndefined();
  expect(downloadSnapshot().storytelling?.phase).toBe('idle');
});

test('a rate-limited download resumes after its cooldown without a page or a new network event', async () => {
  jest.useFakeTimers();
  const value = prepareMulti();
  const normalRequest = mockRequest.getMockImplementation()!;
  mockRequest.mockRejectedValueOnce(Object.assign(new Error('content_credential_rate_limited'), { code: 'content_credential_rate_limited', status: 429, retryAfterSeconds: 5 })).mockImplementation(normalRequest);
  const stop = observeDownloadRuntime();
  try {
    await startDownload(value); await jest.advanceTimersByTimeAsync(0);
    expect(downloadSnapshot().listening).toMatchObject({ phase: 'paused', autoResume: true, error: '稍后重试', errorCode: 'content_credential_rate_limited' });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(4999); expect(mockRequest).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(downloadSnapshot().listening?.saved).toEqual(value);
    expect(downloadSnapshot().listening?.target).toBeUndefined();
  } finally { stop(); jest.useRealTimers(); }
});

test.each(['pause', 'delete', 'account'] as const)('a scheduled retry cannot undo %s', async action => {
  jest.useFakeTimers(); const value = prepareMulti();
  mockRequest.mockRejectedValue(Object.assign(new Error('content_credential_rate_limited'), { status: 429, retryAfterSeconds: 5 }));
  const stop = observeDownloadRuntime();
  try {
    await startDownload(value); await jest.advanceTimersByTimeAsync(0);
    if (action === 'pause') await cancelDownload('listening');
    else if (action === 'delete') await deleteDownload('listening');
    else { mockAccount += '-switched'; await prepareDownloads(); }
    await jest.advanceTimersByTimeAsync(6000);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    if (action === 'pause') expect(downloadSnapshot().listening?.autoResume).toBe(false);
    else expect(downloadSnapshot().listening).toBeUndefined();
  } finally { stop(); jest.useRealTimers(); }
});

test('restart preserves the cooldown without resuming manual pauses', async () => {
  jest.useFakeTimers(); const value = prepareMulti(); mockAccount += '-cooldown';
  mockValues.set(`icao.downloads.v1.${mockAccount}.production`, JSON.stringify({
    listening: { phase: 'paused', target: value, autoResume: true, retryAt: Date.now() + 5000, error: '稍后重试' },
    storytelling: { phase: 'paused', target: { ...value, bankId: 'storytelling' }, autoResume: false },
  }));
  const stop = observeDownloadRuntime();
  try {
    await jest.advanceTimersByTimeAsync(0); expect(mockRequest).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(5000);
    expect(downloadSnapshot().listening?.saved).toBeDefined();
    expect(downloadSnapshot().storytelling?.autoResume).toBe(false);
  } finally { stop(); jest.useRealTimers(); }
});

test('an update check does not call an unfinished download up to date', async () => {
  mockAccount += '-unfinished';
  mockValues.set(`icao.downloads.v1.${mockAccount}.production`, JSON.stringify({ listening: { phase: 'paused', target: manifest(), autoResume: false } }));
  await prepareDownloads();
  expect(await checkDownloadUpdates()).toBe('有未完成下载');
  expect(downloadSnapshot().listening?.autoResume).toBe(false);
});


test('3596169 credential failures recover once while explicit manual pauses remain paused', async () => {
  const value = prepareMulti(); mockAccount += '-legacy';
  mockValues.set(`icao.downloads.v1.${mockAccount}.production`, JSON.stringify({
    listening: { phase: 'paused', target: value, autoResume: false, error: '待验证' },
    storytelling: { phase: 'paused', target: { ...value, bankId: 'storytelling' }, autoResume: false },
  }));
  await prepareDownloads();
  expect(downloadSnapshot().listening).toMatchObject({ autoResume: true, errorCode: 'legacy_credential_failure' });
  const stop = observeDownloadRuntime();
  try {
    await waitFor(() => expect(downloadSnapshot().listening?.saved).toBeDefined());
    expect(downloadSnapshot().storytelling?.autoResume).toBe(false);
  } finally { stop(); }
});
