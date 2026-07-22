import { act, renderHook } from '@testing-library/react-native';

import type { RawRecording } from '../types';

const mockRecorder = {
  currentTime: 0,
  getStatus: jest.fn(),
  isRecording: false,
  prepareToRecordAsync: jest.fn(async () => undefined),
  record: jest.fn(),
  stop: jest.fn(),
  uri: 'file:///cache/Audio/recording.wav',
};

jest.mock('expo-audio', () => ({
  AudioQuality: { HIGH: 96 },
  getRecordingPermissionsAsync: jest.fn(),
  IOSOutputFormat: { LINEARPCM: 'lpcm' },
  RecordingPresets: { HIGH_QUALITY: { ios: {} } },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ durationMillis: 2_000 }),
}));

// Import after the Expo module mock so this test exercises only the adapter contract.
// eslint-disable-next-line import/first
import { useExpoRecorderAdapter } from '../expo-recorder-adapter';

describe('ExpoRecorderAdapter native duration contract', () => {
  let now = 1_000;

  beforeEach(() => {
    jest.clearAllMocks();
    now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    mockRecorder.isRecording = false;
    mockRecorder.record.mockImplementation(() => { mockRecorder.isRecording = true; });
    mockRecorder.stop.mockImplementation(async () => { mockRecorder.isRecording = false; });
    mockRecorder.getStatus.mockImplementation(() => ({
      canRecord: mockRecorder.isRecording,
      durationMillis: mockRecorder.isRecording ? 2_000 : 0,
      isRecording: mockRecorder.isRecording,
      mediaServicesDidReset: false,
      url: mockRecorder.uri,
    }));
    Object.defineProperty(mockRecorder, 'currentTime', {
      configurable: true,
      get: () => { throw new Error('native currentTime must not determine recording duration'); },
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('uses millisecond status and elapsed time without reading platform-divergent currentTime', async () => {
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());

    await act(async () => { await result.current.prepare(); });
    await act(() => { result.current.start(); });
    now = 3_000;

    let raw: RawRecording | undefined;
    await act(async () => { raw = await result.current.stop(); });

    expect(raw).toMatchObject({
      durationMillis: 2_000,
      format: 'wav',
      uri: mockRecorder.uri,
    });
    await unmount();
  });
});
