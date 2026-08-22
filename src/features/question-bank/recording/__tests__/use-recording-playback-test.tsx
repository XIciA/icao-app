import { act, renderHook } from '@testing-library/react-native';

import type { RecordingAsset } from '../types';

let mockStatus = {
  currentTime: 0,
  didJustFinish: false,
  duration: 3,
  isLoaded: true,
  playbackState: 'ready',
  playing: false,
};

const mockPlayer = {
  get currentStatus() { return mockStatus; },
  pause: jest.fn(),
  play: jest.fn(),
  replace: jest.fn(),
  seekTo: jest.fn(async () => undefined),
};
const mockRelease = jest.fn(async (_lease?: unknown) => undefined);
const mockEmitDiagnostic = jest.fn();

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
}));
jest.mock('@/platform/audio', () => ({
  audioSessionOrchestrator: {
    acquire: jest.fn(async () => ({ owner: 'recordingPlayback', token: 1 })),
    register: jest.fn(() => jest.fn()),
    release: (lease: unknown) => mockRelease(lease),
  },
  emitAudioDiagnostic: (event: unknown) => mockEmitDiagnostic(event),
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

describe('Recording playback source contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = {
      currentTime: 0,
      didJustFinish: false,
      duration: 3,
      isLoaded: true,
      playbackState: 'ready',
      playing: false,
    };
  });

  it('ignores a stale finish when the current playback attempt has not progressed', async () => {
    const hook = await renderHook(() => useRecordingPlayback(asset));
    await act(async () => { await hook.result.current.play(); });

    mockStatus = { ...mockStatus, currentTime: 3, didJustFinish: true };
    await hook.rerender({});
    expect(mockEmitDiagnostic).not.toHaveBeenCalledWith(expect.objectContaining({ code: 'playback_completed' }));
    hook.unmount();
  });

  it('rejects a loaded player duration that contradicts the committed asset', async () => {
    jest.useFakeTimers();
    mockStatus = { ...mockStatus, duration: 0.1 };
    const hook = await renderHook(() => useRecordingPlayback(asset));
    await act(async () => { await jest.advanceTimersByTimeAsync(150); });
    expect(hook.result.current.error).toBe('playback_load_failed');
    hook.unmount();
    jest.useRealTimers();
  });
});
