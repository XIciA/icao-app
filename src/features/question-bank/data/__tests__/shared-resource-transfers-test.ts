import { acquireResourceTransfer, processResourceBytes } from '../shared-resource-transfers.native';
import { waitFor } from '@testing-library/react-native';
const mockFiles = new Set<string>();
const mockTasks: { finish(): void; fail(): void; progress(bytes: number): void; cancel: jest.Mock; uri: string }[] = [];
const mockOptional = jest.fn();
jest.mock('expo-file-system', () => {
  class Directory { uri: string; constructor(...parts: any[]) { this.uri = parts.map(part => part.uri ?? part).join('/'); } create() {} }
  class File {
    uri: string; constructor(...parts: any[]) { this.uri = parts.map(part => part.uri ?? part).join('/'); }
    get exists() { return mockFiles.has(this.uri); }
    delete() { mockFiles.delete(this.uri); }
    static downloadFileAsync(url: string, file: File) { return mockOptional(url, file); }
  }
  return { Directory, File, Paths: { cache: 'cache' } };
});
jest.mock('expo-file-system/legacy', () => ({ createDownloadResumable: (_url: string, uri: string, _options: unknown, onProgress: Function) => {
  let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  const cancel = jest.fn(async () => { resolve(undefined); });
  const task = { uri, cancel, finish: () => { mockFiles.add(uri); resolve({ status: 200 }); }, fail: () => { mockFiles.add(uri); reject(new Error('network_failed')); }, progress: (bytes: number) => onProgress({ totalBytesWritten: bytes }) };
  mockTasks.push(task);
  return { downloadAsync: () => promise, cancelAsync: cancel };
} }));
const current = () => true;
const download = (key: string, extra = {}) => acquireResourceTransfer(key, 'https://test/audio', 100, true, { isCurrent: current, ...extra });
beforeEach(() => { mockTasks.length = 0; mockFiles.clear(); mockOptional.mockReset().mockImplementation(async (_url, file) => { mockFiles.add(file.uri); return file; }); });

test('bulk uses two slots while a playback request can acquire a separate native slot', async () => {
  const one = download('one'), two = download('two');
  let thirdCurrent = true;
  const third = download('three', { isCurrent: () => thirdCurrent });
  await waitFor(() => expect(mockTasks).toHaveLength(2));
  const playback = await acquireResourceTransfer('playback', 'https://test/playback', 100, false, { isCurrent: current });
  expect(playback).toBeDefined(); playback!.release();
  thirdCurrent = false;
  mockTasks.forEach(task => task.finish());
  const results = await Promise.all([one, two, third]); results.forEach(result => result?.release());
  expect(results[2]).toBeUndefined(); expect(mockTasks).toHaveLength(2); expect(mockFiles.size).toBe(0);
});
test('active audio reduces bulk to one without cancelling already authorized work', async () => {
  const one = download('active-one', { isPlaybackActive: current });
  const two = download('active-two', { isPlaybackActive: current });
  await waitFor(() => expect(mockTasks).toHaveLength(1)); mockTasks[0].finish();
  (await one)!.release(); await waitFor(() => expect(mockTasks).toHaveLength(2)); mockTasks[1].finish(); (await two)!.release();
});
test('shared playback survives cancelling its download owner and receives current progress', async () => {
  let ownerCurrent = true; const firstProgress = jest.fn(), secondProgress = jest.fn();
  const first = download('shared', { isCurrent: () => ownerCurrent, onProgress: firstProgress });
  await waitFor(() => expect(mockTasks).toHaveLength(1)); mockTasks[0].progress(40);
  const second = acquireResourceTransfer('shared', 'https://test/another-signature', 100, false, { isCurrent: current, onProgress: secondProgress });
  expect(secondProgress).toHaveBeenLastCalledWith(0.4);
  ownerCurrent = false; await new Promise(resolve => setTimeout(resolve, 120));
  expect(mockTasks[0].cancel).not.toHaveBeenCalled(); mockTasks[0].finish();
  expect(await first).toBeUndefined(); const lease = await second; expect(lease).toBeDefined();
  expect(mockFiles.size).toBe(1); expect(secondProgress).toHaveBeenLastCalledWith(1);
  lease!.release(); expect(mockFiles.size).toBe(0);
});
test('all cancelled consumers abort native work and late progress cannot revive them', async () => {
  let live = true; const progress = jest.fn(); const task = download('cancel', { isCurrent: () => live, onProgress: progress });
  await waitFor(() => expect(mockTasks).toHaveLength(1)); live = false;
  await expect(task).rejects.toThrow('download_interrupted'); expect(mockTasks[0].cancel).toHaveBeenCalled();
  progress.mockClear(); mockTasks[0].progress(99); expect(progress).not.toHaveBeenCalled(); expect(mockFiles.size).toBe(0);
});
test('failed shared transfer cleans partial files and can be retried', async () => {
  const first = download('failure'); const checked = expect(first).rejects.toThrow('network_failed');
  await waitFor(() => expect(mockTasks).toHaveLength(1)); mockTasks[0].fail(); await checked; expect(mockFiles.size).toBe(0);
  const retry = download('failure'); await waitFor(() => expect(mockTasks).toHaveLength(2)); mockTasks[1].finish(); (await retry)!.release();
});
test('byte processing is serialized and a failed hash does not block subsequent files', async () => {
  let active = 0, maximum = 0;
  const tasks = Array.from({ length: 4 }, (_, index) => processResourceBytes(async () => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--;
    if (index === 1) throw new Error('checksum_mismatch'); return index;
  }));
  const results = await Promise.allSettled(tasks); expect(maximum).toBe(1);
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'fulfilled']);
});

test('queued playback processing overtakes bulk without interrupting the active file', async () => {
  let release!: () => void; const held = new Promise<void>(done => { release = done; }); const order: string[] = [];
  const first = processResourceBytes(async () => { order.push('active'); await held; });
  const bulk = processResourceBytes(async () => { order.push('bulk'); });
  const playback = processResourceBytes(async () => { order.push('playback'); }, true);
  release(); await Promise.all([first, bulk, playback]); expect(order).toEqual(['active', 'playback', 'bulk']);
});

test('completed network bytes retain their slots until processing consumers release staging', async () => {
  const one = download('staging-one'), two = download('staging-two');
  await waitFor(() => expect(mockTasks).toHaveLength(2)); mockTasks.forEach(task => task.finish());
  const leases = await Promise.all([one, two]);
  const third = download('staging-three'); await new Promise(resolve => setTimeout(resolve, 80));
  expect(mockTasks).toHaveLength(2);
  leases[0]!.release(); await waitFor(() => expect(mockTasks).toHaveLength(3));
  mockTasks[2].finish(); (await third)!.release(); leases[1]!.release(); expect(mockFiles.size).toBe(0);
});
