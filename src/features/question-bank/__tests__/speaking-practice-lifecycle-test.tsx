import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, Platform } from 'react-native';

import type { RecordingAsset, RawRecording } from '../recording/types';
import { SpeakingPracticePanel } from '../components/SpeakingPracticePanel';

// Exercise the frozen Web implementation explicitly; Jest normally prefers .native.
jest.mock('../components/SpeakingPracticePanel', () => jest.requireActual('../components/SpeakingPracticePanel.tsx'));

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

describe('SpeakingPracticePanel lifecycle', () => {
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

  it('leaves Raw cleanup with the repository after commit ownership transfers', async () => {
    mockCommitRaw.mockRejectedValue(new Error('copy failed'));
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalled());
    await act(async () => { fireEvent(screen.getByLabelText('松开结束录音'), 'pressOut'); });

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
    const stopped = deferred<Extract<RawRecording, { kind: 'native-file' }>>();
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

  it('does not blindly retry an unknown native prepare failure', async () => {
    setPlatform('ios');
    mockRecorder.prepare.mockRejectedValue(recorderFailure('recording_native_prepare_failed'));
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });

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

    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
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

    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });

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

  it('notifies the question player before a Web recording-preview lease settles', async () => {
    setPlatform('web');
    const acquired = deferred<{ owner: string; token: number }>();
    mockAcquire.mockReturnValue(acquired.promise);
    mockPlaybackStatus = { currentTime: 0, didJustFinish: false, duration: 3, isLoaded: true, playbackState: 'readyToPlay', playing: false };
    const onPreviewPlaybackStart = jest.fn();
    const screen = await render(<SpeakingPracticePanel {...commonProps} onPreviewPlaybackStart={onPreviewPlaybackStart} recording={committedAsset} />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('播放我的录音'));
      await Promise.resolve();
    });

    expect(onPreviewPlaybackStart).toHaveBeenCalledTimes(1);
    expect(mockPlayback.play).not.toHaveBeenCalled();

    await act(async () => {
      acquired.resolve({ owner: 'recordingPlayback', token: 8 });
      await acquired.promise;
      await Promise.resolve();
    });
    expect(mockPlayback.play).toHaveBeenCalledTimes(1);
    expect(onPreviewPlaybackStart).toHaveBeenCalledTimes(1);
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

  it('primes Web microphone permission with a click before enabling hold-to-record', async () => {
    setPlatform('web');
    const screen = await render(<SpeakingPracticePanel {...commonProps} variant="integrated" />);

    await act(async () => { fireEvent.press(screen.getByLabelText('启用麦克风')); });

    expect(mockRecorder.primePermission).toHaveBeenCalledTimes(1);
    expect(mockRecorder.prepare).not.toHaveBeenCalled();
    expect(mockRecorder.start).not.toHaveBeenCalled();
    expect(screen.queryByText('麦克风已启用，请按住录音')).toBeNull();

    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalledTimes(1));
    await act(async () => { fireEvent(screen.getByLabelText('松开结束录音'), 'pressOut'); });
    await waitFor(() => expect(commonProps.onRecorded).toHaveBeenCalledWith(committedAsset));
    await screen.unmount();
  });

  it('releases the Web permission stream when the user lets go before permission completes', async () => {
    setPlatform('web');
    const permission = deferred<boolean>();
    mockRecorder.cancel.mockResolvedValue(rawRecording);
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('启用麦克风')); });
    mockRecorder.requestPermission.mockReturnValue(permission.promise);
    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
    await act(async () => {
      fireEvent(screen.getByLabelText('按住说话'), 'pressOut');
      permission.resolve(true);
      await permission.promise;
      await Promise.resolve();
    });

    await waitFor(() => expect(mockRecorder.cancel).toHaveBeenCalled());
    expect(mockDiscardRaw).toHaveBeenCalledWith(rawRecording);
    expect(mockRecorder.prepare).not.toHaveBeenCalled();
    expect(mockRecorder.start).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('releases the Web permission stream and lease when the user lets go during lease acquisition', async () => {
    setPlatform('web');
    const acquired = deferred<{ owner: string; token: number }>();
    mockAcquire.mockReturnValue(acquired.promise);
    mockRecorder.cancel.mockResolvedValue(rawRecording);
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('启用麦克风')); });
    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
    await waitFor(() => expect(mockAcquire).toHaveBeenCalledWith('recording', 'recording-start'));
    await act(async () => {
      fireEvent(screen.getByLabelText('按住说话'), 'pressOut');
      acquired.resolve({ owner: 'recording', token: 17 });
      await acquired.promise;
      await Promise.resolve();
    });

    await waitFor(() => expect(mockRecorder.cancel).toHaveBeenCalled());
    expect(mockDiscardRaw).toHaveBeenCalledWith(rawRecording);
    expect(mockRelease).toHaveBeenCalledWith({ owner: 'recording', token: 17 });
    expect(mockRecorder.prepare).not.toHaveBeenCalled();
    expect(mockRecorder.start).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('offers a non-blocking cancel action when Web permission remains unanswered for ten seconds', async () => {
    setPlatform('web');
    const permission = deferred<boolean>();
    const originalSetTimeout = globalThis.setTimeout;
    const timeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, delay?: number) => {
      if (delay === 10_000) {
        callback();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      }
      return originalSetTimeout(callback, delay);
    }) as typeof setTimeout);
    mockRecorder.primePermission.mockReturnValue(permission.promise);
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    fireEvent.press(screen.getByLabelText('启用麦克风'));
    timeoutSpy.mockRestore();

    await waitFor(() => expect(screen.getByText('仍在等待浏览器授权')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByLabelText('取消麦克风授权等待')); });
    await waitFor(() => expect(screen.queryByText('仍在等待浏览器授权')).toBeNull());
    expect(screen.getByLabelText('启用麦克风')).toBeTruthy();
    expect(mockRecorder.cancel).not.toHaveBeenCalled();
    await act(async () => {
      permission.resolve(true);
      await permission.promise;
      await Promise.resolve();
    });
    expect(screen.queryByText('麦克风已启用，请按住录音')).toBeNull();
    expect(screen.getByLabelText('启用麦克风')).toBeTruthy();
    expect(mockRecorder.prepare).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('keeps the retry timer owned by a new Web permission request when the cancelled request resolves late', async () => {
    jest.useFakeTimers();
    setPlatform('web');
    const firstPermission = deferred<boolean>();
    const secondPermission = deferred<boolean>();
    mockRecorder.primePermission
      .mockReturnValueOnce(firstPermission.promise)
      .mockReturnValueOnce(secondPermission.promise);
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('启用麦克风'));
      await Promise.resolve();
    });
    await act(async () => { await jest.advanceTimersByTimeAsync(10_000); });
    expect(screen.getByText('仍在等待浏览器授权')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByLabelText('取消麦克风授权等待')); });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('启用麦克风'));
      await Promise.resolve();
    });
    await act(async () => {
      mockRecorder.permissionReady = true;
      firstPermission.resolve(true);
      await firstPermission.promise;
      await Promise.resolve();
    });
    await screen.rerender(<SpeakingPracticePanel {...commonProps} />);
    const activePrimerButton = screen.getByLabelText('启用麦克风');
    expect(activePrimerButton.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('正在等待麦克风授权…')).toBeTruthy();
    fireEvent(activePrimerButton, 'pressIn');
    expect(mockRecorder.requestPermission).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(10_000); });

    expect(screen.getByText('仍在等待浏览器授权')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('取消麦克风授权等待'));
      secondPermission.resolve(true);
      await secondPermission.promise;
      await Promise.resolve();
    });
    await screen.unmount();
  });

  it('opens the guided compatibility dialog for a hard unsupported Web recorder', async () => {
    setPlatform('web');
    mockRecorder.primePermission.mockRejectedValue(recorderFailure('recording_browser_unsupported'));
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('启用麦克风')); });

    await waitFor(() => expect(screen.getByText('当前浏览器暂不支持网页录音')).toBeTruthy());
    expect(screen.getByText(/iPhone\/iPad 请使用最新版 Safari/)).toBeTruthy();
    expect(screen.getByText('复制链接')).toBeTruthy();
    expect(screen.getByText('继续学习')).toBeTruthy();
    expect(screen.queryByText('新录音无效，已保留原录音。')).toBeNull();

    await act(async () => { fireEvent.press(screen.getByText('继续学习')); });
    await waitFor(() => expect(screen.queryByText('当前浏览器暂不支持网页录音')).toBeNull());
    expect(screen.getByText('当前浏览器无法完成网页录音，请使用推荐浏览器继续。')).toBeTruthy();
    await screen.unmount();
  });

  it('upgrades two consecutive Web preparation failures to compatibility guidance', async () => {
    setPlatform('web');
    mockRecorder.prepare.mockRejectedValue(new Error('encoder setup failed'));
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('启用麦克风')); });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
      await waitFor(() => expect(mockRecorder.prepare).toHaveBeenCalledTimes(attempt + 1));
      await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressOut'); });
      if (attempt === 0) expect(screen.queryByText('当前浏览器暂不支持网页录音')).toBeNull();
    }

    await waitFor(() => expect(screen.getByText('当前浏览器暂不支持网页录音')).toBeTruthy());
    expect(screen.queryByText('新录音无效，已保留原录音。')).toBeNull();
    await screen.unmount();
  });

  it('keeps an old Web recording playable and uses amber guidance when permission is denied', async () => {
    setPlatform('web');
    mockRecorder.primePermission.mockResolvedValue(false);
    mockPlaybackStatus = { currentTime: 0, didJustFinish: false, duration: 3, isLoaded: true, playbackState: 'readyToPlay', playing: false };
    const screen = await render(<SpeakingPracticePanel {...commonProps} recording={committedAsset} variant="integrated" />);

    await act(async () => { fireEvent.press(screen.getByLabelText('启用麦克风')); });

    await waitFor(() => expect(screen.getByText('请在浏览器的网站设置中允许麦克风，然后重新检测。若网站设置已允许但仍无法录音，请使用推荐浏览器打开。原录音已保留。')).toBeTruthy());
    expect(screen.queryByText('未获得麦克风权限，已保留原录音。')).toBeNull();
    expect(screen.queryByText('新录音无效，已保留原录音。')).toBeNull();
    expect(screen.getByLabelText('回放我的录音').props.accessibilityState.disabled).toBe(false);
    await screen.unmount();
  });

  it('turns a Web background interruption into guidance instead of silently cancelling', async () => {
    setPlatform('web');
    const appStateListeners: ((state: 'active' | 'background' | 'inactive') => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListeners.push(listener);
      return { remove: jest.fn() };
    });
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('启用麦克风')); });
    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalled());
    await act(async () => {
      appStateListeners.forEach((listener) => listener('background'));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('本次录音已停止，请让页面保持在前台后重试。')).toBeTruthy());
    expect(mockCommitRaw).not.toHaveBeenCalled();
    expect(screen.queryByText('新录音无效，已保留原录音。')).toBeNull();
    await screen.unmount();
  });

  it('keeps Web recording busy until background cleanup finishes and blocks an immediate retry', async () => {
    setPlatform('web');
    const stopped = deferred<Extract<RawRecording, { kind: 'native-file' }>>();
    const appStateListeners: ((state: 'active' | 'background' | 'inactive') => void)[] = [];
    mockRecorder.stop.mockReturnValue(stopped.promise);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListeners.push(listener);
      return { remove: jest.fn() };
    });
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('启用麦克风')); });
    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalledTimes(1));
    await act(async () => {
      appStateListeners.forEach((listener) => listener('background'));
      await Promise.resolve();
    });

    const busyButton = screen.getByLabelText('按住说话');
    expect(busyButton.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('正在保存录音…')).toBeTruthy();
    fireEvent(busyButton, 'pressIn');
    expect(mockRecorder.start).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('本次录音已停止，请让页面保持在前台后重试。')).toBeNull();

    await act(async () => {
      stopped.resolve(rawRecording);
      await stopped.promise;
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('本次录音已停止，请让页面保持在前台后重试。')).toBeTruthy());
    await screen.unmount();
  });

  it('observes an immediate Web recorder stop through its runtime event without a duration tick', async () => {
    setPlatform('web');
    mockRecorder.stop.mockRejectedValue(recorderFailure('recording_interrupted'));
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('启用麦克风')); });
    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalledTimes(1));
    await act(async () => {
      mockRuntimeListener?.({ reason: 'track-ended', type: 'interrupted' });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('本次录音已停止，请让页面保持在前台后重试。')).toBeTruthy());
    expect(mockRecorder.cancel).toHaveBeenCalled();
    expect(mockCommitRaw).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('opens compatibility guidance when an immediate Web recorder error reports an unsupported encoder', async () => {
    setPlatform('web');
    mockRecorder.stop.mockRejectedValue(recorderFailure('recording_browser_unsupported'));
    const screen = await render(<SpeakingPracticePanel {...commonProps} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('启用麦克风')); });
    await act(async () => { fireEvent(screen.getByLabelText('按住说话'), 'pressIn'); });
    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalledTimes(1));
    await act(async () => {
      mockRuntimeListener?.({ code: 'recording_browser_unsupported', type: 'error' });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('当前浏览器暂不支持网页录音')).toBeTruthy());
    expect(mockCommitRaw).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('discards a late Web replacement commit after backgrounding and keeps the old recording', async () => {
    setPlatform('web');
    const committed = deferred<RecordingAsset>();
    const appStateListeners: ((state: 'active' | 'background' | 'inactive') => void)[] = [];
    mockCommitRaw.mockReturnValue(committed.promise);
    mockPlaybackStatus = { currentTime: 0, didJustFinish: false, duration: 3, isLoaded: true, playbackState: 'readyToPlay', playing: false };
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListeners.push(listener);
      return { remove: jest.fn() };
    });
    const screen = await render(<SpeakingPracticePanel {...commonProps} recording={committedAsset} variant="integrated" />);

    expect(screen.getByText('启用麦克风')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByLabelText('启用麦克风')); });
    await waitFor(() => expect(screen.getByText('按住重录')).toBeTruthy());
    await act(async () => { fireEvent(screen.getByLabelText('按住重新录音'), 'pressIn'); });
    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalled());
    await act(async () => { fireEvent(screen.getByLabelText('松开结束录音'), 'pressOut'); });
    await waitFor(() => expect(mockCommitRaw).toHaveBeenCalledTimes(1));
    await act(async () => {
      appStateListeners.forEach((listener) => listener('background'));
      await Promise.resolve();
    });
    await act(async () => {
      committed.resolve({ ...committedAsset, id: 'late-asset', uri: 'blob:late' });
      await committed.promise;
      await Promise.resolve();
    });

    await waitFor(() => expect(mockDiscard).toHaveBeenCalledWith(expect.objectContaining({ id: 'late-asset' })));
    expect(commonProps.onRecorded).not.toHaveBeenCalled();
    expect(screen.getByText('本次录音已停止，请让页面保持在前台后重试。原录音已保留。')).toBeTruthy();
    expect(screen.getByLabelText('回放我的录音').props.accessibilityState.disabled).toBe(false);
    await screen.unmount();
  });
});
