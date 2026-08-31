import { act, renderHook } from '@testing-library/react-native';

import type { RecordingAsset } from '../types';

type MockStatus = {
  currentTime: number;
  didJustFinish: boolean;
  duration: number;
  isLoaded: boolean;
  playbackState: 'error' | 'idle' | 'loading' | 'ready';
  playing: boolean;
};

type MockPlayer = ReturnType<typeof mockCreatePlayer>;

let mockInitialStatus: MockStatus = {
  currentTime: 0,
  didJustFinish: false,
  duration: 3,
  isLoaded: true,
  playbackState: 'ready',
  playing: false,
};
let mockInitialStatusAvailable = true;
let mockPlayerSerial = 0;
const mockPlayers = new Map<string, MockPlayer>();

function mockCreatePlayer(sourceKey: string) {
  let currentStatus = mockInitialStatusAvailable ? { ...mockInitialStatus } : undefined;
  const listeners = new Set<(status: MockStatus) => void>();
  const player = {
    addListener: jest.fn((_event: string, listener: (status: MockStatus) => void) => {
      listeners.add(listener);
      return { remove: jest.fn(() => listeners.delete(listener)) };
    }),
    emit(status: MockStatus) {
      currentStatus = { ...status };
      listeners.forEach((listener) => listener({ ...status }));
    },
    get currentStatus() { return currentStatus; },
    id: `player-${++mockPlayerSerial}`,
    pause: jest.fn(),
    play: jest.fn(),
    replace: jest.fn(),
    seekTo: jest.fn(async () => undefined),
    sourceKey,
  };
  return player;
}

function mockGetPlayer(source: unknown) {
  const key = JSON.stringify(source);
  const existing = mockPlayers.get(key);
  if (existing) return existing;
  const player = mockCreatePlayer(key);
  mockPlayers.set(key, player);
  return player;
}

const mockRelease = jest.fn(async (_lease?: unknown) => undefined);
const mockAcquire = jest.fn(async (..._args: unknown[]) => ({ owner: 'recordingPlayback', token: 1 }));
const mockEmitDiagnostic = jest.fn();

jest.mock('@/platform/audio', () => ({
  audioSessionOrchestrator: {
    acquire: (...args: unknown[]) => mockAcquire(...args),
    register: jest.fn(() => jest.fn()),
    release: (lease: unknown) => mockRelease(lease),
  },
  emitAudioDiagnostic: (event: unknown) => mockEmitDiagnostic(event),
  useSessionManagedAudioPlayer: (source: unknown) => mockGetPlayer(source),
}));
jest.mock('../recording-repository', () => ({
  recordingRepository: { assetExists: () => true },
}));

// eslint-disable-next-line import/first
import { useRecordingPlayback } from '../use-recording-playback';

const asset: RecordingAsset = {
  byteSize: 16_000,
  cardId: 'card-1',
  createdAt: '2026-08-21T00:00:00.000Z',
  durationMillis: 3_000,
  format: 'm4a',
  id: 'asset-1',
  mimeType: 'audio/mp4',
  sessionId: 'session-1',
  storageKind: 'native-file',
  uri: 'file:///asset.m4a',
};

const assetB: RecordingAsset = {
  ...asset,
  durationMillis: 8_000,
  id: 'asset-2',
  uri: 'file:///asset-b.m4a',
};

function mockCurrentPlayer() {
  return [...mockPlayers.values()].at(-1)!;
}

describe('Recording playback source contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayers.clear();
    mockPlayerSerial = 0;
    mockInitialStatus = {
      currentTime: 0,
      didJustFinish: false,
      duration: 3,
      isLoaded: true,
      playbackState: 'ready',
      playing: false,
    };
    mockInitialStatusAvailable = true;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ignores a stale finish when the current playback attempt has not progressed', async () => {
    const hook = await renderHook(() => useRecordingPlayback(asset));
    await act(async () => { await hook.result.current.play(); });

    await act(async () => {
      mockCurrentPlayer().emit({ ...mockInitialStatus, currentTime: 3, didJustFinish: true });
    });
    expect(mockEmitDiagnostic).not.toHaveBeenCalledWith(expect.objectContaining({ code: 'playback_completed' }));
    hook.unmount();
  });

  it('rejects a loaded player duration that contradicts the committed asset', async () => {
    jest.useFakeTimers();
    mockInitialStatus = { ...mockInitialStatus, duration: 0.1 };
    const hook = await renderHook(() => useRecordingPlayback(asset));
    await act(async () => { await jest.advanceTimersByTimeAsync(150); });
    expect(hook.result.current.error).toBe('playback_load_failed');
    hook.unmount();
  });

  it('stays explicitly loading when the native player has no current source status', async () => {
    jest.useFakeTimers();
    mockInitialStatusAvailable = false;

    const hook = await renderHook(() => useRecordingPlayback(asset));
    await act(async () => { await jest.advanceTimersByTimeAsync(150); });

    expect(hook.result.current.status).toEqual(expect.objectContaining({ isLoaded: false, playbackState: 'loading' }));
    expect(hook.result.current.error).toBeUndefined();
    hook.unmount();
  });

  it('binds replacement status to the new source and ignores late events from the old source', async () => {
    jest.useFakeTimers();
    let currentAsset = asset;
    const hook = await renderHook(() => useRecordingPlayback(currentAsset));
    const playerA = mockCurrentPlayer();

    mockInitialStatusAvailable = false;
    currentAsset = assetB;
    await hook.rerender({});
    const playerB = mockCurrentPlayer();
    expect(playerB).not.toBe(playerA);
    expect(hook.result.current.status.isLoaded).toBe(false);

    await act(async () => {
      playerA.emit({ ...mockInitialStatus, currentTime: 3, didJustFinish: true });
      await jest.advanceTimersByTimeAsync(150);
    });
    expect(hook.result.current.status.isLoaded).toBe(false);
    expect(hook.result.current.error).toBeUndefined();

    await act(async () => {
      playerB.emit({ ...mockInitialStatus, duration: 8 });
      await jest.advanceTimersByTimeAsync(150);
    });
    expect(hook.result.current.status).toEqual(expect.objectContaining({ duration: 8, isLoaded: true }));
    expect(hook.result.current.error).toBeUndefined();
    hook.unmount();
  });

  it('times out when a same-duration replacement never emits a source-bound status', async () => {
    jest.useFakeTimers();
    const sameDurationAssetB = { ...assetB, durationMillis: asset.durationMillis };
    let currentAsset = asset;
    const hook = await renderHook(() => useRecordingPlayback(currentAsset));
    mockInitialStatusAvailable = false;
    currentAsset = sameDurationAssetB;
    await hook.rerender({});

    await act(async () => { await jest.advanceTimersByTimeAsync(4_000); });
    expect(hook.result.current.error).toBe('playback_load_failed');
    hook.unmount();
  });

  it('creates a new source generation on retry and ignores the previous player', async () => {
    jest.useFakeTimers();
    const hook = await renderHook(() => useRecordingPlayback(asset));
    const firstPlayer = mockCurrentPlayer();
    mockInitialStatusAvailable = false;

    await act(async () => { hook.result.current.retry(); });
    const retryPlayer = mockCurrentPlayer();
    expect(retryPlayer).not.toBe(firstPlayer);

    await act(async () => {
      firstPlayer.emit({ ...mockInitialStatus, duration: 0.1 });
      await jest.advanceTimersByTimeAsync(150);
    });
    expect(hook.result.current.status.isLoaded).toBe(false);
    expect(hook.result.current.error).toBeUndefined();
    hook.unmount();
  });

  it('releases a pending lease when the source changes before acquire resolves', async () => {
    let resolveAcquire: ((lease: { owner: string; token: number }) => void) | undefined;
    mockAcquire.mockImplementationOnce(() => new Promise((resolve) => { resolveAcquire = resolve; }));
    let currentAsset = asset;
    const hook = await renderHook(() => useRecordingPlayback(currentAsset));

    let playResult: boolean | undefined;
    await act(async () => {
      const pendingPlay = hook.result.current.play().then((result) => { playResult = result; });
      currentAsset = assetB;
      await hook.rerender({});
      resolveAcquire?.({ owner: 'recordingPlayback', token: 7 });
      await pendingPlay;
    });

    expect(playResult).toBe(false);
    expect(mockRelease).toHaveBeenCalledWith(expect.objectContaining({ token: 7 }));
    expect(mockCurrentPlayer().play).not.toHaveBeenCalled();
    hook.unmount();
  });
});
