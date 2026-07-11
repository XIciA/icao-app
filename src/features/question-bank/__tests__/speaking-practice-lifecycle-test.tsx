import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { SpeakingPracticePanel } from '../components/SpeakingPracticePanel';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const mockRecorder = {
  currentTime: 0,
  getAvailableInputs: jest.fn(() => []),
  getStatus: jest.fn(() => ({ durationMillis: 0, url: undefined })),
  isRecording: false,
  prepareToRecordAsync: jest.fn((): Promise<void> => Promise.resolve()),
  record: jest.fn(),
  setInput: jest.fn(),
  stop: jest.fn(async () => undefined),
  uri: undefined,
};

const mockPlayback = {
  pause: jest.fn(),
  play: jest.fn(),
  replace: jest.fn(),
  seekTo: jest.fn(async () => undefined),
};

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
  useAudioPlayerStatus: () => ({ currentTime: 0, didJustFinish: false, duration: 0, isLoaded: false, playing: false }),
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ durationMillis: 0, isRecording: mockRecorder.isRecording }),
}));

describe('SpeakingPracticePanel lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecorder.isRecording = false;
    mockRecorder.prepareToRecordAsync.mockResolvedValue(undefined);
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
    appStateListener?.('background');
    preparation.resolve();
    await preparation.promise;
    await Promise.resolve();

    expect(mockRecorder.record).not.toHaveBeenCalled();
    await screen.unmount();
  });
});
