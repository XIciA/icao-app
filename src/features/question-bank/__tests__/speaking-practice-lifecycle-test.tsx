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
    exists = mockFileExists;
    get size() { return mockFileSize; }
    delete() { mockDeleteFile(); }
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
    mockPermissionPromise = permission.promise;
    const screen = await render(<SpeakingPracticePanel mode="speaking" onClear={jest.fn()} onRecorded={jest.fn()} />);

    await fireEvent(screen.getByLabelText('按住说话'), 'pressIn');
    await screen.unmount();
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
    mockRecorder.currentTime = 3;
    mockRecorder.uri = 'file:///valid.wav';
    mockRecorder.getStatus.mockReturnValue({ durationMillis: 3_000, url: 'file:///valid.wav' });
    const screen = await render(<SpeakingPracticePanel mode="speaking" onClear={jest.fn()} onRecorded={onRecorded} />);

    await waitFor(() => expect(screen.getByLabelText('按住说话')).toBeTruthy());
    await act(async () => {
      fireEvent(screen.getByLabelText('按住说话'), 'pressIn');
      await pause(220);
    });
    await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
    expect(mockRecorder.setInput).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent(screen.getByLabelText('松开结束录音'), 'pressOut');
      await pause(350);
    });
    await waitFor(() => expect(screen.getByText('正在校验录音文件与实际时长…')).toBeTruthy());
    expect(onRecorded).not.toHaveBeenCalled();

    mockPlaybackStatus = { ...mockPlaybackStatus, duration: 2.8, isLoaded: true, playbackState: 'readyToPlay' };
    await screen.rerender(<SpeakingPracticePanel mode="speaking" onClear={jest.fn()} onRecorded={onRecorded} />);

    await waitFor(() => expect(onRecorded).toHaveBeenCalledWith({ uri: 'file:///valid.wav', durationMillis: 2_800 }));
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
});
