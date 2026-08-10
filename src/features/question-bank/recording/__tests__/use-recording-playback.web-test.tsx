import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import {
  RECORDING_PLAYBACK_START_TIMEOUT_MS,
  useRecordingPlayback,
} from '../use-recording-playback.web';
import type { RecordingAsset } from '../types';

const mockAcquire = jest.fn();
const mockRelease = jest.fn();
const mockRegister = jest.fn();
const mockEmitAudioDiagnostic = jest.fn();
const mockAssetExists = jest.fn();
const mockDiscard = jest.fn();

jest.mock('@/platform/audio', () => ({
  audioSessionOrchestrator: {
    acquire: (...args: unknown[]) => mockAcquire(...args),
    register: (...args: unknown[]) => mockRegister(...args),
    release: (...args: unknown[]) => mockRelease(...args),
  },
  emitAudioDiagnostic: (...args: unknown[]) => mockEmitAudioDiagnostic(...args),
}));

jest.mock('../recording-repository', () => ({
  recordingRepository: {
    assetExists: (...args: unknown[]) => mockAssetExists(...args),
    discard: (...args: unknown[]) => mockDiscard(...args),
  },
}));

type Deferred<T> = {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done, fail) => {
    reject = fail;
    resolve = done;
  });
  return { promise, reject, resolve };
}

type MediaListener = (event: Event) => void;

class MockAudio {
  static instances: MockAudio[] = [];

  readonly listeners = new Map<string, Set<MediaListener>>();
  currentSrc = '';
  currentTime = 0;
  duration = Number.NaN;
  ended = false;
  paused = true;
  preload = '';
  src = '';
  nextPlayResult = () => Promise.resolve();
  load = jest.fn(() => {
    this.currentSrc = this.src;
  });
  pause = jest.fn(() => {
    this.paused = true;
  });
  play = jest.fn(() => {
    this.paused = false;
    return this.nextPlayResult();
  });
  removeAttribute = jest.fn((name: string) => {
    if (name === 'src') {
      this.currentSrc = '';
      this.src = '';
    }
  });

  constructor() {
    MockAudio.instances.push(this);
  }

  addEventListener(type: string, listener: MediaListener) {
    const listeners = this.listeners.get(type) ?? new Set<MediaListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: MediaListener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string) {
    const event = new Event(type);
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

const firstAsset: RecordingAsset = {
  byteSize: 48_000,
  cardId: 'card-1',
  createdAt: '2026-08-10T00:00:00.000Z',
  durationMillis: 3_000,
  format: 'webm',
  id: 'asset-1',
  sessionId: 'session-1',
  uri: 'blob:https://feizhuicao.com/asset-1',
};

const secondAsset: RecordingAsset = {
  ...firstAsset,
  id: 'asset-2',
  uri: 'blob:https://feizhuicao.com/asset-2',
};

function currentAudio() {
  const audio = MockAudio.instances.at(-1);
  if (!audio) throw new Error('Expected the hook to create a Web Audio element.');
  return audio;
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useRecordingPlayback.web', () => {
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  let previousAppState = AppState.currentState;
  let leaseToken = 0;

  beforeAll(() => {
    Object.defineProperty(globalThis, 'Audio', {
      configurable: true,
      value: MockAudio,
    });
  });

  afterAll(() => {
    if (originalAudio) Object.defineProperty(globalThis, 'Audio', originalAudio);
    else Reflect.deleteProperty(globalThis, 'Audio');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    MockAudio.instances = [];
    leaseToken = 0;
    previousAppState = AppState.currentState;
    (AppState as unknown as { currentState: typeof AppState.currentState }).currentState = 'active';
    mockAcquire.mockImplementation(async () => ({ owner: 'recordingPlayback', token: ++leaseToken }));
    mockRelease.mockResolvedValue(undefined);
    mockRegister.mockReturnValue(jest.fn());
    mockAssetExists.mockReturnValue(true);
  });

  afterEach(async () => {
    await cleanup();
    (AppState as unknown as { currentState: typeof AppState.currentState }).currentState = previousAppState;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('calls native play synchronously before the recordingPlayback lease settles', async () => {
    const acquired = deferred<{ owner: 'recordingPlayback'; token: number }>();
    mockAcquire.mockReturnValueOnce(acquired.promise);
    const hook = await renderHook(() => useRecordingPlayback(firstAsset));
    const audio = currentAudio();
    let started!: Promise<boolean>;

    await act(async () => {
      started = hook.result.current.play();
      expect(mockAcquire).toHaveBeenCalledWith('recordingPlayback', 'recording-preview');
      expect(audio.play).toHaveBeenCalledTimes(1);
      acquired.resolve({ owner: 'recordingPlayback', token: 1 });
      expect(await started).toBe(true);
    });
    expect(hook.result.current.status.isLoaded).toBe(true);
    await waitFor(() => expect(hook.result.current.status.playing).toBe(true));
  });

  it('catches a rejected play promise and releases a lease that arrives later', async () => {
    const acquired = deferred<{ owner: 'recordingPlayback'; token: number }>();
    mockAcquire.mockReturnValueOnce(acquired.promise);
    const hook = await renderHook(() => useRecordingPlayback(firstAsset));
    const audio = currentAudio();
    audio.nextPlayResult = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'));

    let started = true;
    await act(async () => {
      started = await hook.result.current.play();
    });
    expect(started).toBe(false);
    expect(hook.result.current.error).toBe('playback_start_failed');
    expect(audio.pause).toHaveBeenCalled();

    await act(async () => {
      acquired.resolve({ owner: 'recordingPlayback', token: 7 });
      await acquired.promise;
      await Promise.resolve();
    });
    expect(mockRelease).toHaveBeenCalledWith({ owner: 'recordingPlayback', token: 7 });
  });

  it('pauses and reports a start failure when the lease is rejected', async () => {
    mockAcquire.mockRejectedValueOnce(new Error('session unavailable'));
    const hook = await renderHook(() => useRecordingPlayback(firstAsset));
    const audio = currentAudio();
    let started = true;

    await act(async () => {
      started = await hook.result.current.play();
    });

    expect(started).toBe(false);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.pause).toHaveBeenCalled();
    expect(hook.result.current.error).toBe('playback_start_failed');
  });

  it('releases a late lease after pause makes the operation stale', async () => {
    const acquired = deferred<{ owner: 'recordingPlayback'; token: number }>();
    mockAcquire.mockReturnValueOnce(acquired.promise);
    const hook = await renderHook(() => useRecordingPlayback(firstAsset));
    const audio = currentAudio();
    let started!: Promise<boolean>;

    await act(async () => {
      started = hook.result.current.play();
      hook.result.current.pause();
      acquired.resolve({ owner: 'recordingPlayback', token: 12 });
      expect(await started).toBe(false);
    });

    expect(audio.pause).toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledWith({ owner: 'recordingPlayback', token: 12 });
    expect(hook.result.current.status.playing).toBe(false);
  });

  it('does not let a stale acquisition pause a newer playback operation', async () => {
    const firstAcquire = deferred<{ owner: 'recordingPlayback'; token: number }>();
    const secondAcquire = deferred<{ owner: 'recordingPlayback'; token: number }>();
    mockAcquire
      .mockReturnValueOnce(firstAcquire.promise)
      .mockReturnValueOnce(secondAcquire.promise);
    const hook = await renderHook(() => useRecordingPlayback(firstAsset));
    const audio = currentAudio();
    let firstStarted!: Promise<boolean>;
    let secondStarted!: Promise<boolean>;

    await act(async () => {
      firstStarted = hook.result.current.play();
      secondStarted = hook.result.current.play();
      await Promise.resolve();
    });
    const pauseCallsBeforeStaleAcquire = audio.pause.mock.calls.length;

    await act(async () => {
      firstAcquire.resolve({ owner: 'recordingPlayback', token: 31 });
      expect(await firstStarted).toBe(false);
    });
    expect(audio.pause).toHaveBeenCalledTimes(pauseCallsBeforeStaleAcquire);
    expect(audio.paused).toBe(false);
    expect(mockRelease).toHaveBeenCalledWith({ owner: 'recordingPlayback', token: 31 });

    await act(async () => {
      secondAcquire.resolve({ owner: 'recordingPlayback', token: 32 });
      expect(await secondStarted).toBe(true);
    });
    expect(hook.result.current.status.playing).toBe(true);
  });

  it('pauses and releases when the page becomes inactive', async () => {
    let appStateListener: ((state: 'active' | 'background' | 'inactive') => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    const hook = await renderHook(() => useRecordingPlayback(firstAsset));
    const audio = currentAudio();

    await act(async () => {
      expect(await hook.result.current.play()).toBe(true);
    });
    await act(async () => appStateListener?.('background'));
    await flushPromises();

    expect(audio.pause).toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledWith({ owner: 'recordingPlayback', token: 1 });
    expect(hook.result.current.status.playing).toBe(false);
  });

  it('keeps one element, releases playback, and ignores old-source events on asset replacement', async () => {
    const hook = await renderHook(
      ({ asset }: { asset: RecordingAsset }) => useRecordingPlayback(asset),
      { initialProps: { asset: firstAsset } },
    );
    const audio = currentAudio();
    const oldPlaying = Array.from(audio.listeners.get('playing') ?? [])[0];
    await act(async () => {
      expect(await hook.result.current.play()).toBe(true);
    });

    await hook.rerender({ asset: secondAsset });
    await flushPromises();
    expect(MockAudio.instances).toHaveLength(1);
    expect(audio.src).toBe(secondAsset.uri);
    expect(audio.pause).toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledWith({ owner: 'recordingPlayback', token: 1 });

    await act(async () => oldPlaying?.(new Event('playing')));
    expect(hook.result.current.status.playing).toBe(false);

    audio.currentSrc = firstAsset.uri;
    await act(async () => audio.emit('error'));
    expect(hook.result.current.error).toBeUndefined();
    audio.currentSrc = secondAsset.uri;
  });

  it('releases on natural completion and restarts the same element from zero', async () => {
    const hook = await renderHook(() => useRecordingPlayback(firstAsset));
    const audio = currentAudio();
    audio.duration = 3;
    await act(async () => audio.emit('loadedmetadata'));
    await act(async () => {
      expect(await hook.result.current.play()).toBe(true);
    });
    audio.currentTime = 3;
    audio.ended = true;
    await act(async () => audio.emit('ended'));
    await flushPromises();

    expect(hook.result.current.status.didJustFinish).toBe(true);
    expect(mockRelease).toHaveBeenCalledWith({ owner: 'recordingPlayback', token: 1 });

    audio.ended = false;
    await act(async () => {
      expect(await hook.result.current.play()).toBe(true);
    });
    expect(audio.currentTime).toBe(0);
    expect(MockAudio.instances).toHaveLength(1);
  });

  it('releases a pending lease after unmount', async () => {
    const acquired = deferred<{ owner: 'recordingPlayback'; token: number }>();
    mockAcquire.mockReturnValueOnce(acquired.promise);
    const hook = await renderHook(() => useRecordingPlayback(firstAsset));
    const audio = currentAudio();

    await act(async () => {
      void hook.result.current.play();
      await Promise.resolve();
    });
    await hook.unmount();
    await act(async () => {
      acquired.resolve({ owner: 'recordingPlayback', token: 24 });
      await acquired.promise;
      await Promise.resolve();
    });

    expect(audio.pause).toHaveBeenCalled();
    expect(audio.removeAttribute).toHaveBeenCalledWith('src');
    expect(mockRelease).toHaveBeenCalledWith({ owner: 'recordingPlayback', token: 24 });
  });

  it('keeps a metadata-deferred Blob playable until the user starts it', async () => {
    jest.useFakeTimers();
    const hook = await renderHook(() => useRecordingPlayback(firstAsset));

    await act(async () => {
      jest.advanceTimersByTime(RECORDING_PLAYBACK_START_TIMEOUT_MS * 2);
      await Promise.resolve();
    });
    expect(hook.result.current.error).toBeUndefined();
    expect(hook.result.current.status.isLoaded).toBe(true);
    await act(async () => {
      expect(await hook.result.current.play()).toBe(true);
    });
  });

  it('bounds a play promise that never settles and releases its acquired lease', async () => {
    jest.useFakeTimers();
    const pendingPlay = deferred<void>();
    const hook = await renderHook(() => useRecordingPlayback(firstAsset));
    const audio = currentAudio();
    audio.nextPlayResult = () => pendingPlay.promise;
    let started!: Promise<boolean>;

    await act(async () => {
      started = hook.result.current.play();
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(RECORDING_PLAYBACK_START_TIMEOUT_MS);
      expect(await started).toBe(false);
    });
    await flushPromises();

    expect(hook.result.current.error).toBe('playback_start_failed');
    expect(audio.pause).toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledWith({ owner: 'recordingPlayback', token: 1 });
  });

  it('does not publish a timeout error after unmount and still releases a late lease', async () => {
    jest.useFakeTimers();
    const pendingPlay = deferred<void>();
    const acquired = deferred<{ owner: 'recordingPlayback'; token: number }>();
    mockAcquire.mockReturnValueOnce(acquired.promise);
    const hook = await renderHook(() => useRecordingPlayback(firstAsset));
    const audio = currentAudio();
    audio.nextPlayResult = () => pendingPlay.promise;
    let started!: Promise<boolean>;

    await act(async () => {
      started = hook.result.current.play();
      await Promise.resolve();
    });
    await hook.unmount();
    await act(async () => {
      acquired.resolve({ owner: 'recordingPlayback', token: 41 });
      jest.advanceTimersByTime(RECORDING_PLAYBACK_START_TIMEOUT_MS);
      expect(await started).toBe(false);
    });

    expect(mockRelease).toHaveBeenCalledWith({ owner: 'recordingPlayback', token: 41 });
    expect(mockEmitAudioDiagnostic).not.toHaveBeenCalledWith(expect.objectContaining({
      code: 'playback_start_failed',
    }));
  });

  it('keeps the asset intact when the repository reports it missing', async () => {
    const hook = await renderHook(() => useRecordingPlayback(firstAsset));

    expect(mockDiscard).not.toHaveBeenCalled();

    mockAssetExists.mockReturnValue(false);
    await act(async () => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.error).toBe('asset_missing'));
    expect(mockDiscard).not.toHaveBeenCalled();
  });
});
