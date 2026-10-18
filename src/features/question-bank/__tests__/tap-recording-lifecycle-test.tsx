import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, Platform } from 'react-native';

import type { RecordingAsset, RawRecording } from '../recording/types';
import { SpeakingPracticePanel } from '../components/SpeakingPracticePanel.native';

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
  mimeType: 'audio/wav',
  sessionId: 'session-1',
  storageKind: 'native-file',
  uri: 'file:///cache/icao-recordings/session-1/asset-1.wav',
};

const rawRecording: Extract<RawRecording, { kind: 'native-file' }> = {
  format: 'wav',
  kind: 'native-file',
  mimeType: 'audio/wav',
  recorderDurationMs: 3_000,
  uri: 'file:///raw.wav',
};

let mockRuntimeListener: ((event: import('../recording/types').RecorderRuntimeEvent) => void) | undefined;

const mockRecorder = {
  cancel: jest.fn(async () => undefined as RawRecording | undefined),
  dispose: jest.fn(async () => undefined),
  get isWeb() { return Platform.OS === 'web'; },
  getSnapshot: jest.fn(() => ({ canRecord: true, durationMs: 3_000, isRecording: false, mediaServicesDidReset: false, state: 'prepared' as const })),
  isRecording: jest.fn(() => false),
  lifecycleRevision: 0,
  permissionReady: false,
  prepare: jest.fn(async () => undefined),
  primePermission: jest.fn(async () => true),
  requestPermission: jest.fn(async () => true),
  start: jest.fn(async () => undefined),
  stop: jest.fn(async () => rawRecording),
  subscribe: jest.fn((listener: (event: import('../recording/types').RecorderRuntimeEvent) => void) => {
    mockRuntimeListener = listener;
    return () => { if (mockRuntimeListener === listener) mockRuntimeListener = undefined; };
  }),
};
const mockPlayback = {
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  get currentStatus() { return mockPlaybackStatus; },
  id: 'speaking-practice-playback',
  pause: jest.fn(),
  play: jest.fn(),
  remove: jest.fn(),
  replace: jest.fn(),
  seekTo: jest.fn(async () => undefined),
};

let mockPlaybackStatus = { currentTime: 0, didJustFinish: false, duration: 0, isLoaded: false, playbackState: 'loading', playing: false };
let mockPlaybackSources: unknown[] = [];
const mockCommitRaw = jest.fn(async (_input?: unknown) => committedAsset);
const mockDiscard = jest.fn((_asset?: unknown) => undefined);
const mockDiscardRaw = jest.fn((_uri?: unknown) => undefined);
const mockAcquire = jest.fn(async (owner: string, _reason: string) => ({ owner, token: 1 }));
const mockRelease = jest.fn(async (_lease?: unknown) => undefined);
let previousAppState = AppState.currentState;
const initialPlatform = Platform.OS;
const mockRouterPush = jest.fn();

function setPlatform(platform: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
}

function recorderFailure(code: string) {
  return Object.assign(new Error(code), { code });
}

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayback,
  useAudioPlayerStatus: () => mockPlaybackStatus,
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockRouterPush }) }));

jest.mock('@/platform/audio', () => ({
  audioSessionOrchestrator: {
    acquire: (owner: string, reason: string) => mockAcquire(owner, reason),
    getActiveOwner: jest.fn(() => 'recording'),
    register: jest.fn(() => jest.fn()),
    release: (lease: unknown) => mockRelease(lease),
  },
  emitAudioDiagnostic: jest.fn(),
  useSessionManagedAudioPlayer: (source: unknown) => {
    mockPlaybackSources.push(source);
    return mockPlayback;
  },
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

describe('Native tap recording lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    previousAppState = AppState.currentState;
    let monotonicNow = 0;
    jest.spyOn(globalThis.performance, 'now').mockImplementation(() => {
      monotonicNow += 1_000;
      return monotonicNow;
    });
    (AppState as unknown as { currentState: typeof AppState.currentState }).currentState = 'active';
    commonProps.onClear = jest.fn();
    commonProps.onRecorded = jest.fn();
    mockRecorder.cancel.mockResolvedValue(undefined);
    mockRecorder.isRecording.mockReturnValue(false);
    mockRecorder.lifecycleRevision = 0;
    mockRecorder.permissionReady = false;
    mockRuntimeListener = undefined;
    mockRecorder.prepare.mockResolvedValue(undefined);
    mockRecorder.primePermission.mockImplementation(async () => {
      mockRecorder.permissionReady = true;
      return true;
    });
    mockRecorder.requestPermission.mockResolvedValue(true);
    mockRecorder.start.mockImplementation(async () => { mockRecorder.isRecording.mockReturnValue(true); });
    mockRecorder.stop.mockImplementation(async () => {
      mockRecorder.isRecording.mockReturnValue(false);
      return rawRecording;
    });
    mockPlayback.pause.mockImplementation(() => undefined);
    mockPlayback.addListener.mockImplementation(() => ({ remove: jest.fn() }));
    mockPlayback.play.mockImplementation(() => undefined);
    mockPlayback.remove.mockImplementation(() => undefined);
    mockPlayback.replace.mockImplementation(() => undefined);
    mockPlayback.seekTo.mockResolvedValue(undefined);
    mockAcquire.mockImplementation(async (owner: string) => ({ owner, token: 1 }));
    mockRelease.mockResolvedValue(undefined);
    mockCommitRaw.mockResolvedValue(committedAsset);
    mockPlaybackStatus = { currentTime: 0, didJustFinish: false, duration: 0, isLoaded: false, playbackState: 'loading', playing: false };
    mockPlaybackSources = [];
  });

  afterEach(async () => {
    await cleanup();
    jest.useRealTimers();
    setPlatform(initialPlatform);
    (AppState as unknown as { currentState: typeof AppState.currentState }).currentState = previousAppState;
    jest.restoreAllMocks();
  });

  it.each(['ios', 'android'] as const)('on %s records between taps and publishes without waiting for playback', async (platform) => {
    setPlatform(platform);
    const onInteractionChange = jest.fn();
    const screen = await render(<SpeakingPracticePanel {...commonProps} onInteractionChange={onInteractionChange} />);

    await act(async () => { fireEvent(screen.getByLabelText('开始录音'), 'press'); });
    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalled());
    await act(async () => { fireEvent(screen.getByLabelText('停止录音'), 'pressOut'); });
    expect(mockRecorder.stop).not.toHaveBeenCalled();
    await act(async () => { fireEvent(screen.getByLabelText('停止录音'), 'press'); });

    await waitFor(() => expect(mockCommitRaw).toHaveBeenCalledWith(expect.objectContaining({ cardId: 'card-1', sessionId: 'session-1' })));
    await waitFor(() => expect(commonProps.onRecorded).toHaveBeenCalledWith(committedAsset));
    expect(mockPlaybackStatus.isLoaded).toBe(false);
    expect(commonProps.onClear).not.toHaveBeenCalled();
    await waitFor(() => expect(onInteractionChange).toHaveBeenLastCalledWith(false));
    await screen.unmount();
  });

  it('leaves Raw cleanup with the repository after commit ownership transfers', async () => {
    mockCommitRaw.mockRejectedValue(new Error('copy failed'));
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent(screen.getByLabelText('开始录音'), 'press'); });
    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalled());
    await act(async () => { fireEvent(screen.getByLabelText('停止录音'), 'press'); });

    expect(mockDiscardRaw).not.toHaveBeenCalledWith(rawRecording);
    expect(commonProps.onRecorded).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('keeps the managed playback object alive until a recording asset exists', async () => {
    const screen = await render(<SpeakingPracticePanel {...commonProps} variant="integrated" />);

    expect(screen.queryByText('录音回放准备失败，可以重试回放。')).toBeNull();
    expect(mockPlayback.remove).not.toHaveBeenCalled();
    expect(mockPlayback.replace).not.toHaveBeenCalled();

    await screen.rerender(<SpeakingPracticePanel {...commonProps} recording={committedAsset} variant="integrated" />);

    await waitFor(() => expect(mockPlaybackSources).toContainEqual(expect.objectContaining({
      uri: committedAsset.uri,
    })));
    expect(mockPlayback.replace).not.toHaveBeenCalled();
    expect(mockPlayback.remove).not.toHaveBeenCalled();
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

    await act(async () => { fireEvent(screen.getByLabelText('开始录音'), 'press'); });
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

    await act(async () => { fireEvent(screen.getByLabelText('开始录音'), 'press'); });
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

  it('coalesces repeated stop taps into one native stop and one commit', async () => {
    const stopped = deferred<Extract<RawRecording, { kind: 'native-file' }>>();
    mockRecorder.stop.mockImplementation(async () => {
      const raw = await stopped.promise;
      mockRecorder.isRecording.mockReturnValue(false);
      return raw;
    });
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent(screen.getByLabelText('开始录音'), 'press'); });
    const button = screen.getByLabelText('停止录音');
    await fireEvent(button, 'press');
    await fireEvent(button, 'press');
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

    await act(async () => { fireEvent(screen.getByLabelText('开始录音'), 'press'); });
    await fireEvent(screen.getByLabelText('停止录音'), 'press');
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

    await act(async () => { fireEvent(screen.getByLabelText('点击重新录音'), 'press'); });

    await waitFor(() => expect(screen.getByText('未获得麦克风权限，已保留原录音。')).toBeTruthy());
    expect(commonProps.onClear).not.toHaveBeenCalled();
    expect(mockDiscard).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('does not blindly retry an unknown native prepare failure', async () => {
    setPlatform('ios');
    mockRecorder.prepare.mockRejectedValue(recorderFailure('recording_native_prepare_failed'));
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent(screen.getByLabelText('开始录音'), 'press'); });

    await waitFor(() => expect(screen.getByText(/系统录音器准备失败.*诊断编号/u)).toBeTruthy());
    expect(mockRecorder.prepare).toHaveBeenCalledTimes(1);
    expect(mockRecorder.start).not.toHaveBeenCalled();
    expect(screen.getByLabelText('提交录音诊断')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('提交录音诊断'));
      await Promise.resolve();
    });
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/info/[slug]',
      params: expect.objectContaining({
        correlationId: expect.stringMatching(/^R-[A-Z0-9]+-[A-Z0-9]{2}$/u),
        feature: 'recording',
      }),
    });
    await screen.unmount();
  });

  it('reports a native recording interruption when the app backgrounds', async () => {
    setPlatform('ios');
    const appStateListeners: ((state: 'active' | 'background' | 'inactive') => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListeners.push(listener);
      return { remove: jest.fn() };
    });
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent(screen.getByLabelText('开始录音'), 'press'); });
    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalledTimes(1));
    await act(async () => {
      appStateListeners.forEach((listener) => listener('background'));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText(/录音已中断.*诊断编号/u)).toBeTruthy());
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalled();
    expect(commonProps.onRecorded).not.toHaveBeenCalled();
    expect(screen.getByLabelText('提交录音诊断')).toBeTruthy();
    await screen.unmount();
  });

  it('keeps an owner-pause timeout distinct from native recorder preparation', async () => {
    setPlatform('ios');
    mockAcquire.mockRejectedValue(recorderFailure('owner_pause_timeout'));
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent(screen.getByLabelText('开始录音'), 'press'); });

    await waitFor(() => expect(screen.getByText(/上一段音频暂停超时.*诊断编号/u)).toBeTruthy());
    expect(mockRecorder.prepare).not.toHaveBeenCalled();
    expect(mockRecorder.start).not.toHaveBeenCalled();
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

});
