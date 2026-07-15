import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { SpeakingPracticePanel } from '../components/SpeakingPracticePanel';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function pause(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

const mockRecorder = {
  currentTime: 0,
  getAvailableInputs: jest.fn(() => []),
  getStatus: jest.fn((): { durationMillis: number; url: string | undefined } => ({ durationMillis: 0, url: undefined })),
  isRecording: false,
  prepareToRecordAsync: jest.fn((): Promise<void> => Promise.resolve()),
  record: jest.fn(),
  setInput: jest.fn(),
  stop: jest.fn(async () => undefined),
  uri: undefined as string | undefined,
};

const mockPlayback = {
  pause: jest.fn(),
  play: jest.fn(),
  replace: jest.fn(),
  seekTo: jest.fn(async () => undefined),
};

let mockPlaybackStatus = { currentTime: 0, didJustFinish: false, duration: 0, isLoaded: false, playbackState: 'loading', playing: false };
let mockFileExists = true;
let mockFileSize = 100_000;
const mockDeleteFile = jest.fn();

let mockPermissionPromise: Promise<{ granted: boolean }> = Promise.resolve({ granted: true });

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('expo-audio', () => ({
  AudioQuality: { HIGH: 'high' },
  IOSOutputFormat: { LINEARPCM: 'lpcm' },
  RecordingPresets: { HIGH_QUALITY: { ios: {} } },
  requestRecordingPermissionsAsync: jest.fn(() => mockPermissionPromise),
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioPlayer: () => mockPlayback,
  useAudioPlayerStatus: () => mockPlaybackStatus,
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ durationMillis: 0, isRecording: mockRecorder.isRecording }),
}));

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    constructor(readonly mockUri: string) {}
    exists = mockFileExists;
    get size() { return mockFileSize; }
    delete() { mockDeleteFile(this.mockUri); }
  },
}));

describe('SpeakingPracticePanel lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecorder.isRecording = false;
    mockRecorder.currentTime = 0;
    mockRecorder.uri = undefined;
    mockRecorder.getStatus.mockReturnValue({ durationMillis: 0, url: undefined });
    mockRecorder.prepareToRecordAsync.mockResolvedValue(undefined);
    mockRecorder.record.mockImplementation(() => { mockRecorder.isRecording = true; });
    mockRecorder.stop.mockImplementation(async () => { mockRecorder.isRecording = false; });
    mockPlaybackStatus = { currentTime: 0, didJustFinish: false, duration: 0, isLoaded: false, playbackState: 'loading', playing: false };
    mockFileExists = true;
    mockFileSize = 100_000;
    mockPermissionPromise = Promise.resolve({ granted: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cancels a permission-pending start when the component unmounts', async () => {
    const permission = deferred<{ granted: boolean }>();
    const onInteractionChange = jest.fn();
    mockPermissionPromise = permission.promise;
    const screen = await render(<SpeakingPracticePanel mode="speaking" onClear={jest.fn()} onInteractionChange={onInteractionChange} onRecorded={jest.fn()} />);

    await fireEvent(screen.getByLabelText('按住说话'), 'pressIn');
    expect(onInteractionChange).toHaveBeenLastCalledWith(true);
    await screen.unmount();
    expect(onInteractionChange).toHaveBeenLastCalledWith(false);
    permission.resolve({ granted: true });
    await permission.promise;
    await Promise.resolve();

    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
    expect(mockRecorder.record).not.toHaveBeenCalled();
  });

  it('cancels a prepare-pending start when the app backgrounds', async () => {
    const preparation = deferred<void>();
    mockRecorder.prepareToRecordAsync.mockReturnValue(preparation.promise);
    let appStateListener: ((state: 'active' | 'background' | 'inactive') => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    const screen = await render(<SpeakingPracticePanel mode="speaking" onClear={jest.fn()} onRecorded={jest.fn()} />);

    await fireEvent(screen.getByLabelText('按住说话'), 'pressIn');
    await waitFor(() => expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalled());
    await act(async () => {
      appStateListener?.('background');
      preparation.resolve();
      await preparation.promise;
      await Promise.resolve();
    });

    expect(mockRecorder.record).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('publishes a recording only after file and player duration validation', async () => {
    const onRecorded = jest.fn();
    const onInteractionChange = jest.fn();
    mockRecorder.currentTime = 3;
    mockRecorder.uri = 'file:///valid.wav';
    mockRecorder.getStatus.mockReturnValue({ durationMillis: 3_000, url: 'file:///valid.wav' });
    const screen = await render(<SpeakingPracticePanel mode="speaking" onClear={jest.fn()} onInteractionChange={onInteractionChange} onRecorded={onRecorded} />);

    await waitFor(() => expect(screen.getByLabelText('按住说话')).toBeTruthy());
    await act(async () => {
      fireEvent(screen.getByLabelText('按住说话'), 'pressIn');
      await pause(220);
    });
    await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
    expect(onInteractionChange).toHaveBeenLastCalledWith(true);
    expect(mockRecorder.setInput).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent(screen.getByLabelText('松开结束录音'), 'pressOut');
      await pause(350);
    });
    await waitFor(() => expect(screen.getByText('正在保存录音…')).toBeTruthy());
    expect(onRecorded).not.toHaveBeenCalled();
    expect(onInteractionChange).toHaveBeenLastCalledWith(true);

    mockPlaybackStatus = { ...mockPlaybackStatus, duration: 2.8, isLoaded: true, playbackState: 'readyToPlay' };
    await screen.rerender(<SpeakingPracticePanel mode="speaking" onClear={jest.fn()} onInteractionChange={onInteractionChange} onRecorded={onRecorded} />);

    await waitFor(() => expect(onRecorded).toHaveBeenCalledWith({ uri: 'file:///valid.wav', durationMillis: 2_800 }));
    await waitFor(() => expect(onInteractionChange).toHaveBeenLastCalledWith(false));
    await screen.unmount();
  });

  it('rejects and deletes a header-only recording before playback or transcription', async () => {
    const onRecorded = jest.fn();
    mockFileSize = 4_096;
    mockRecorder.currentTime = 3;
    mockRecorder.uri = 'file:///empty.wav';
    mockRecorder.getStatus.mockReturnValue({ durationMillis: 3_000, url: 'file:///empty.wav' });
    const screen = await render(<SpeakingPracticePanel mode="speaking" onClear={jest.fn()} onRecorded={onRecorded} />);

    await act(async () => {
      fireEvent(screen.getByLabelText('按住说话'), 'pressIn');
      await pause(220);
    });
    await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
    await act(async () => {
      fireEvent(screen.getByLabelText('松开结束录音'), 'pressOut');
      await pause(350);
    });

    await waitFor(() => expect(screen.getByText('没有生成有效录音文件，请重新录制。')).toBeTruthy());
    expect(onRecorded).not.toHaveBeenCalled();
    expect(mockDeleteFile).toHaveBeenCalled();
    await screen.unmount();
  });

  it('pauses preview on request and restarts completed playback from zero', async () => {
    const recording = { uri: 'file:///saved.wav', durationMillis: 2_000 };
    const onPreviewPlaybackStart = jest.fn();
    mockPlaybackStatus = { currentTime: 2, didJustFinish: true, duration: 2, isLoaded: true, playbackState: 'readyToPlay', playing: false };
    const screen = await render(
      <SpeakingPracticePanel mode="speaking" onClear={jest.fn()} onPreviewPlaybackStart={onPreviewPlaybackStart} onRecorded={jest.fn()} previewPauseRequest={0} recording={recording} />,
    );
    mockPlayback.pause.mockClear();
    mockPlayback.play.mockClear();
    mockPlayback.seekTo.mockClear();

    fireEvent.press(screen.getByLabelText('播放我的录音'));
    await waitFor(() => expect(mockPlayback.seekTo).toHaveBeenCalledWith(0));
    expect(onPreviewPlaybackStart).toHaveBeenCalledTimes(1);
    expect(mockPlayback.play).toHaveBeenCalledTimes(1);
    expect(mockPlayback.seekTo.mock.invocationCallOrder[0]).toBeLessThan(mockPlayback.play.mock.invocationCallOrder[0]);

    await screen.rerender(
      <SpeakingPracticePanel mode="speaking" onClear={jest.fn()} onPreviewPlaybackStart={onPreviewPlaybackStart} onRecorded={jest.fn()} previewPauseRequest={1} recording={recording} />,
    );
    expect(mockPlayback.pause).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it('keeps the original recording until a replacement passes validation', async () => {
    const onClear = jest.fn();
    const onRecorded = jest.fn();
    const original = { uri: 'file:///original.wav', durationMillis: 2_000 };
    mockPlaybackStatus = { currentTime: 0, didJustFinish: false, duration: 2, isLoaded: true, playbackState: 'readyToPlay', playing: false };
    const screen = await render(<SpeakingPracticePanel mode="speaking" onClear={onClear} onRecorded={onRecorded} recording={original} />);

    fireEvent.press(screen.getByLabelText('重新录音'));
    await waitFor(() => expect(screen.getByText('原录音会保留至新录音成功')).toBeTruthy());
    expect(mockDeleteFile).not.toHaveBeenCalledWith(original.uri);
    expect(onClear).not.toHaveBeenCalled();

    mockRecorder.currentTime = 3;
    mockRecorder.uri = 'file:///replacement.wav';
    mockRecorder.getStatus.mockReturnValue({ durationMillis: 3_000, url: 'file:///replacement.wav' });
    await act(async () => {
      fireEvent(screen.getByLabelText('按住重新录音'), 'pressIn');
      await pause(220);
    });
    await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
    mockPlaybackStatus = { currentTime: 0, didJustFinish: false, duration: 0, isLoaded: false, playbackState: 'loading', playing: false };
    await act(async () => {
      fireEvent(screen.getByLabelText('松开结束录音'), 'pressOut');
      await pause(350);
    });

    expect(onRecorded).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalledWith(original.uri);
    mockPlaybackStatus = { ...mockPlaybackStatus, duration: 2.8, isLoaded: true, playbackState: 'readyToPlay' };
    await screen.rerender(<SpeakingPracticePanel mode="speaking" onClear={onClear} onRecorded={onRecorded} recording={original} />);

    await waitFor(() => expect(onRecorded).toHaveBeenCalledWith({ uri: 'file:///replacement.wav', durationMillis: 2_800 }));
    await waitFor(() => expect(mockDeleteFile).toHaveBeenCalledWith(original.uri));
    expect(onClear).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('restores the original card when a replacement file is invalid', async () => {
    const onClear = jest.fn();
    const original = { uri: 'file:///original.wav', durationMillis: 2_000 };
    mockPlaybackStatus = { currentTime: 0, didJustFinish: false, duration: 2, isLoaded: true, playbackState: 'readyToPlay', playing: false };
    const screen = await render(<SpeakingPracticePanel mode="speaking" onClear={onClear} onRecorded={jest.fn()} recording={original} />);

    fireEvent.press(screen.getByLabelText('重新录音'));
    await waitFor(() => expect(screen.getByLabelText('按住重新录音')).toBeTruthy());
    mockFileSize = 4_096;
    mockRecorder.currentTime = 3;
    mockRecorder.uri = 'file:///invalid-replacement.wav';
    mockRecorder.getStatus.mockReturnValue({ durationMillis: 3_000, url: 'file:///invalid-replacement.wav' });
    await act(async () => {
      fireEvent(screen.getByLabelText('按住重新录音'), 'pressIn');
      await pause(220);
    });
    await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
    await act(async () => {
      fireEvent(screen.getByLabelText('松开结束录音'), 'pressOut');
      await pause(350);
    });

    await waitFor(() => expect(screen.getByLabelText('重新录音')).toBeTruthy());
    expect(screen.getByText('没有生成有效的新录音，已保留原录音。')).toBeTruthy();
    expect(mockDeleteFile).toHaveBeenCalledWith('file:///invalid-replacement.wav');
    expect(mockDeleteFile).not.toHaveBeenCalledWith(original.uri);
    expect(onClear).not.toHaveBeenCalled();
    await screen.unmount();
  });
});
