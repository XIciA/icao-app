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

test('four bulk sockets reserve playback capacity and release sockets before sealing finishes', async () => {
  const requests = ['one', 'two', 'three', 'four'].map(key => download(key));
  let fifthCurrent = true;
  const fifth = download('five', { isCurrent: () => fifthCurrent });
  await waitFor(() => expect(mockTasks).toHaveLength(4));
  const playing = acquireResourceTransfer('playback', 'https://test/playback', 100, false, { isCurrent: current, playback: true });
  await waitFor(() => expect(mockTasks).toHaveLength(5));
  mockTasks[0].finish();
  const first = await requests[0]; // Keep the staged file while processing is pending.
  await waitFor(() => expect(mockTasks).toHaveLength(6));
  expect(mockFiles.has(first!.file.uri)).toBe(true);
  fifthCurrent = false;
  mockTasks.slice(1).forEach(task => task.finish());
  const results = await Promise.all([...requests, playing, fifth]);
  results.forEach(result => result?.release());
  expect(mockFiles.size).toBe(0);
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

test('staging byte budget holds back more work until sealed files release', async () => {
  const large = (key: string) => acquireResourceTransfer(key, 'https://test/audio', 45 * 1024 * 1024, true, { isCurrent: current });
  const one = large('large-one'), two = large('large-two');
  await waitFor(() => expect(mockTasks).toHaveLength(1)); mockTasks[0].finish();
  const first = await one;
  await new Promise(resolve => setTimeout(resolve, 60));
  expect(mockTasks).toHaveLength(1);
  first!.release(); await waitFor(() => expect(mockTasks).toHaveLength(2));
  mockTasks[1].finish(); (await two)!.release(); expect(mockFiles.size).toBe(0);
});

test('optional-first shared transfer aborts when playback and joined required download both cancel', async () => {
  let playbackCurrent = true, downloadCurrent = true, finishLegacy!: () => void;
  mockOptional.mockImplementation(() => new Promise<void>(resolve => { finishLegacy = resolve; }));
  const playback = acquireResourceTransfer('optional-first-cancel', 'https://test/playback', 100, false, { isCurrent: () => playbackCurrent, playback: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  const required = download('optional-first-cancel', { isCurrent: () => downloadCurrent });
  const settled = Promise.allSettled([playback, required]); let done = false;
  void settled.then(() => { done = true; });
  playbackCurrent = false; downloadCurrent = false;
  try {
    await waitFor(() => expect(done).toBe(true), { timeout: 600 });
    expect(mockTasks).toHaveLength(1); expect(mockTasks[0].cancel).toHaveBeenCalledTimes(1);
    expect(mockOptional).not.toHaveBeenCalled(); expect(mockFiles.size).toBe(0);
  } finally { finishLegacy?.(); await settled; }
  const next = download('after-shared-cancel');
  await waitFor(() => expect(mockTasks).toHaveLength(2)); mockTasks[1].finish(); (await next)!.release();
});

test.each(['playback', 'download'])('optional-first sharing keeps the other consumer alive when only %s cancels', async cancelled => {
  let playbackCurrent = true, downloadCurrent = true;
  const first = acquireResourceTransfer(`optional-first-${cancelled}`, 'https://test/play', 100, false, { isCurrent: () => playbackCurrent, playback: true });
  await waitFor(() => expect(mockTasks).toHaveLength(1));
  const second = download(`optional-first-${cancelled}`, { isCurrent: () => downloadCurrent });
  if (cancelled === 'playback') playbackCurrent = false; else downloadCurrent = false;
  await new Promise(resolve => setTimeout(resolve, 180));
  expect(mockTasks[0].cancel).not.toHaveBeenCalled(); expect(mockOptional).not.toHaveBeenCalled();
  mockTasks[0].finish(); const results = await Promise.all([first, second]);
  expect(results[cancelled === 'playback' ? 0 : 1]).toBeUndefined();
  expect(results[cancelled === 'playback' ? 1 : 0]).toBeDefined();
  results.forEach(result => result?.release()); expect(mockFiles.size).toBe(0);
});

test('optional-first transfer has the same timeout even with a joined live download', async () => {
  jest.useFakeTimers();
  try {
    const first = acquireResourceTransfer('optional-timeout', 'https://test/play', 100, false, { isCurrent: current, playback: true });
    await Promise.resolve();
    const second = download('optional-timeout');
    const settled = Promise.allSettled([first, second]);
    expect(mockTasks).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(120000);
    const outcomes = await settled;
    expect(outcomes.map(outcome => outcome.status)).toEqual(['rejected', 'rejected']);
    expect(mockTasks[0].cancel).toHaveBeenCalledTimes(1); expect(mockFiles.size).toBe(0);
  } finally { jest.useRealTimers(); }
});

test('late native success after timeout cannot publish progress or a usable file', async () => {
  jest.useFakeTimers();
  try {
    const progress = jest.fn();
    const pending = acquireResourceTransfer('late-timeout', 'https://test/play', 100, false, { isCurrent: current, playback: true, onProgress: progress });
    const outcome = expect(pending).rejects.toThrow('download_interrupted');
    await Promise.resolve(); mockTasks[0].cancel.mockImplementation(async () => undefined);
    await jest.advanceTimersByTimeAsync(120000); progress.mockClear();
    mockTasks[0].progress(90); expect(progress).not.toHaveBeenCalled();
    mockTasks[0].finish(); await outcome; expect(mockFiles.size).toBe(0);
  } finally { jest.useRealTimers(); }
});
