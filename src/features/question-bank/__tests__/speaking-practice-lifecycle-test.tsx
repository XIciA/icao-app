import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import type { RecordingAsset, RawRecording } from '../recording/types';
import { SpeakingPracticePanel } from '../components/SpeakingPracticePanel';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const committedAsset: RecordingAsset = {
  byteSize: 96_000,
  cardId: 'card-1',
  createdAt: '2026-07-16T00:00:00.000Z',
  durationMillis: 3_000,
  format: 'wav',
  id: 'asset-1',
  sessionId: 'session-1',
  uri: 'file:///cache/icao-recordings/session-1/asset-1.wav',
};

const rawRecording: RawRecording = {
  durationMillis: 3_000,
  format: 'wav',
  minBytesPerMillisecond: 6.4,
  uri: 'file:///raw.wav',
};

const mockRecorder = {
  cancel: jest.fn(async () => undefined as string | undefined),
  durationMillis: 3_000,
  isRecording: jest.fn(() => false),
  prepare: jest.fn(async () => undefined),
  requestPermission: jest.fn(async () => true),
  start: jest.fn(),
  stop: jest.fn(async () => rawRecording),
};

const mockPlayback = {
  pause: jest.fn(),
  play: jest.fn(),
  remove: jest.fn(),
  replace: jest.fn(),
  seekTo: jest.fn(async () => undefined),
};

let mockPlaybackStatus = { currentTime: 0, didJustFinish: false, duration: 0, isLoaded: false, playbackState: 'loading', playing: false };
const mockCommitRaw = jest.fn(async (_input?: unknown) => committedAsset);
const mockDiscard = jest.fn((_asset?: unknown) => undefined);
const mockDiscardRaw = jest.fn((_uri?: unknown) => undefined);
const mockAcquire = jest.fn(async (owner: string, _reason: string) => ({ owner, token: 1 }));
const mockRelease = jest.fn(async (_lease?: unknown) => undefined);
let previousAppState = AppState.currentState;

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayback,
  useAudioPlayerStatus: () => mockPlaybackStatus,
}));

jest.mock('@/platform/audio', () => ({
  audioSessionOrchestrator: {
    acquire: (owner: string, reason: string) => mockAcquire(owner, reason),
    register: jest.fn(() => jest.fn()),
    release: (lease: unknown) => mockRelease(lease),
  },
  emitAudioDiagnostic: jest.fn(),
}));

jest.mock('../recording/expo-recorder-adapter', () => ({
  useExpoRecorderAdapter: () => mockRecorder,
}));

jest.mock('../recording/recording-repository', () => ({
  RecordingRepositoryError: class RecordingRepositoryError extends Error {
    code: string;
    constructor(value: string) {
      super(value);
      this.code = value;
    }
  },
  recordingRepository: {
    assetExists: jest.fn(() => true),
    commitRaw: (input: unknown) => mockCommitRaw(input),
    discard: (asset: unknown) => mockDiscard(asset),
    discardRaw: (uri: unknown) => mockDiscardRaw(uri),
  },
}));

const commonProps = {
  cardId: 'card-1',
  mode: 'speaking' as const,
  onClear: jest.fn(),
  onRecorded: jest.fn(),
  sessionId: 'session-1',
};

describe('SpeakingPracticePanel lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    previousAppState = AppState.currentState;
    (AppState as unknown as { currentState: typeof AppState.currentState }).currentState = 'active';
    commonProps.onClear = jest.fn();
    commonProps.onRecorded = jest.fn();
    mockRecorder.isRecording.mockReturnValue(false);
    mockRecorder.prepare.mockResolvedValue(undefined);
    mockRecorder.requestPermission.mockResolvedValue(true);
    mockRecorder.start.mockImplementation(() => { mockRecorder.isRecording.mockReturnValue(true); });
    mockRecorder.stop.mockImplementation(async () => {
      mockRecorder.isRecording.mockReturnValue(false);
      return rawRecording;
    });
    mockPlayback.pause.mockImplementation(() => undefined);
    mockPlayback.play.mockImplementation(() => undefined);
    mockPlayback.remove.mockImplementation(() => undefined);
    mockPlayback.replace.mockImplementation(() => undefined);
    mockPlayback.seekTo.mockResolvedValue(undefined);
    mockAcquire.mockImplementation(async (owner: string) => ({ owner, token: 1 }));
    mockRelease.mockResolvedValue(undefined);
    mockCommitRaw.mockResolvedValue(committedAsset);
    mockPlaybackStatus = { currentTime: 0, didJustFinish: false, duration: 0, isLoaded: false, playbackState: 'loading', playing: false };
  });

  afterEach(async () => {
    await cleanup();
    (AppState as unknown as { currentState: typeof AppState.currentState }).currentState = previousAppState;
    jest.restoreAllMocks();
  });

  it('publishes a valid recording without waiting for the playback player', async () => {
    const onInteractionChange = jest.fn();
    const screen = await render(<SpeakingPracticePanel {...commonProps} onInteractionChange={onInteractionChange} />);

    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalled());
    await act(async () => { fireEvent(screen.getByLabelText('松开结束录音'), 'pressOut'); });

    await waitFor(() => expect(mockCommitRaw).toHaveBeenCalledWith(expect.objectContaining({ cardId: 'card-1', sessionId: 'session-1' })));
    await waitFor(() => expect(commonProps.onRecorded).toHaveBeenCalledWith(committedAsset));
    expect(mockPlaybackStatus.isLoaded).toBe(false);
    expect(commonProps.onClear).not.toHaveBeenCalled();
    await waitFor(() => expect(onInteractionChange).toHaveBeenLastCalledWith(false));
    await screen.unmount();
  });

  it('asks the repository to discard the raw file after a commit failure', async () => {
    mockCommitRaw.mockRejectedValue(new Error('copy failed'));
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalled());
    await act(async () => { fireEvent(screen.getByLabelText('松开结束录音'), 'pressOut'); });

    await waitFor(() => expect(mockDiscardRaw).toHaveBeenCalledWith(rawRecording.uri));
    expect(commonProps.onRecorded).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('does not report a playback failure before a recording asset exists', async () => {
    const screen = await render(<SpeakingPracticePanel {...commonProps} variant="integrated" />);

    expect(screen.queryByText('录音回放准备失败，可以重试回放。')).toBeNull();
    expect(mockPlayback.remove).toHaveBeenCalled();
    expect(mockPlayback.replace).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('does not crash cleanup when Fast Refresh already released the native playback object', async () => {
    mockPlayback.pause.mockImplementation(() => { throw new Error('NativeSharedObjectNotFoundException'); });
    const screen = await render(<SpeakingPracticePanel {...commonProps} recording={committedAsset} />);

    await screen.unmount();

    expect(mockPlayback.pause).toHaveBeenCalled();
    expect(commonProps.onClear).not.toHaveBeenCalled();
    expect(mockDiscard).not.toHaveBeenCalled();
  });

  it('cancels a permission-pending start when the component unmounts', async () => {
    const permission = deferred<boolean>();
    mockRecorder.requestPermission.mockReturnValue(permission.promise);
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
    await screen.unmount();
    permission.resolve(true);
    await permission.promise;
    await act(async () => Promise.resolve());

    expect(mockRecorder.prepare).not.toHaveBeenCalled();
    expect(mockRecorder.start).not.toHaveBeenCalled();
  });

  it('cancels a prepare-pending start when the app backgrounds', async () => {
    const preparation = deferred<undefined>();
    mockRecorder.prepare.mockReturnValue(preparation.promise);
    const appStateListeners: ((state: 'active' | 'background' | 'inactive') => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListeners.push(listener);
      return { remove: jest.fn() };
    });
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
    await waitFor(() => expect(mockRecorder.prepare).toHaveBeenCalled());
    await act(async () => {
      appStateListeners.forEach((listener) => listener('background'));
      preparation.resolve(undefined);
      await preparation.promise;
    });

    expect(mockRecorder.start).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalled();
    await screen.unmount();
  });

  it('coalesces repeated release events into one native stop and one commit', async () => {
    const stopped = deferred<RawRecording>();
    mockRecorder.stop.mockImplementation(async () => {
      const raw = await stopped.promise;
      mockRecorder.isRecording.mockReturnValue(false);
      return raw;
    });
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
    const button = screen.getByLabelText('松开结束录音');
    await fireEvent(button, 'pressOut');
    await fireEvent(button, 'pressOut');
    await waitFor(() => expect(mockRecorder.stop).toHaveBeenCalledTimes(1));

    await act(async () => {
      stopped.resolve(rawRecording);
      await stopped.promise;
      await Promise.resolve();
    });
    await waitFor(() => expect(mockCommitRaw).toHaveBeenCalledTimes(1));
    await screen.unmount();
  });

  it('drops a stale commit result when the app backgrounds during finalization', async () => {
    const committed = deferred<RecordingAsset>();
    mockCommitRaw.mockReturnValue(committed.promise);
    const appStateListeners: ((state: 'active' | 'background' | 'inactive') => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListeners.push(listener);
      return { remove: jest.fn() };
    });
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
    await fireEvent(screen.getByLabelText('松开结束录音'), 'pressOut');
    await waitFor(() => expect(mockCommitRaw).toHaveBeenCalledTimes(1));
    appStateListeners.forEach((listener) => listener('background'));
    await act(async () => {
      committed.resolve(committedAsset);
      await committed.promise;
      await Promise.resolve();
    });

    await waitFor(() => expect(mockDiscard).toHaveBeenCalledWith(committedAsset));
    expect(commonProps.onRecorded).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('keeps the previous recording when a replacement cannot start', async () => {
    mockRecorder.requestPermission.mockResolvedValue(false);
    const screen = await render(<SpeakingPracticePanel {...commonProps} recording={committedAsset} variant="integrated" />);

    await act(async () => { fireEvent(screen.getByLabelText('按住重新录音'), 'pressIn'); });

    await waitFor(() => expect(screen.getByText('未获得麦克风权限，已保留原录音。')).toBeTruthy());
    expect(commonProps.onClear).not.toHaveBeenCalled();
    expect(mockDiscard).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('does not clear a committed recording when playback loading fails', async () => {
    mockPlaybackStatus = { currentTime: 0, didJustFinish: false, duration: 0, isLoaded: false, playbackState: 'error', playing: false };
    const screen = await render(<SpeakingPracticePanel {...commonProps} recording={committedAsset} />);

    await waitFor(() => expect(screen.getByText('录音回放准备失败，可以重试回放。')).toBeTruthy());
    expect(screen.getByText('重试回放')).toBeTruthy();
    expect(commonProps.onClear).not.toHaveBeenCalled();
    expect(mockDiscard).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('restarts completed playback from zero through the independent playback consumer', async () => {
    mockPlaybackStatus = { currentTime: 3, didJustFinish: true, duration: 3, isLoaded: true, playbackState: 'readyToPlay', playing: false };
    const onPreviewPlaybackStart = jest.fn();
    const screen = await render(<SpeakingPracticePanel {...commonProps} onPreviewPlaybackStart={onPreviewPlaybackStart} recording={committedAsset} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('播放我的录音')); });

    await waitFor(() => expect(mockPlayback.seekTo).toHaveBeenCalledWith(0));
    expect(mockPlayback.play).toHaveBeenCalled();
    expect(onPreviewPlaybackStart).toHaveBeenCalled();
    await screen.unmount();
  });

  it('does not start playback when a pause request makes an acquired lease stale', async () => {
    const acquired = deferred<{ owner: string; token: number }>();
    mockAcquire.mockReturnValue(acquired.promise);
    mockPlaybackStatus = { currentTime: 0, didJustFinish: false, duration: 3, isLoaded: true, playbackState: 'readyToPlay', playing: false };
    const screen = await render(<SpeakingPracticePanel {...commonProps} previewPauseRequest={0} recording={committedAsset} />);

    fireEvent.press(screen.getByLabelText('播放我的录音'));
    await waitFor(() => expect(mockAcquire).toHaveBeenCalledWith('recordingPlayback', 'recording-preview'));
    await screen.rerender(<SpeakingPracticePanel {...commonProps} previewPauseRequest={1} recording={committedAsset} />);
    await act(async () => {
      acquired.resolve({ owner: 'recordingPlayback', token: 9 });
      await acquired.promise;
      await Promise.resolve();
    });

    expect(mockPlayback.play).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledWith({ owner: 'recordingPlayback', token: 9 });
    await screen.unmount();
  });
});
