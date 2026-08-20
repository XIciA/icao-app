import { act, renderHook } from '@testing-library/react-native';

import type { RawRecording } from '../types';

const mockRecorder = {
  currentTime: 0,
  getStatus: jest.fn(),
  isRecording: false,
  prepareToRecordAsync: jest.fn(async () => undefined),
  record: jest.fn(),
  stop: jest.fn(),
  uri: 'file:///cache/Audio/recording.m4a',
};

jest.mock('expo-audio', () => ({
  AudioQuality: { HIGH: 96 },
  getRecordingPermissionsAsync: jest.fn(),
  IOSOutputFormat: { MPEG4AAC: 'aac' },
  RecordingPresets: { HIGH_QUALITY: { ios: {} } },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ durationMillis: 2_000, isRecording: mockRecorder.isRecording, metering: -30 }),
}));

// Import after the Expo module mock so this test exercises only the adapter contract.
// eslint-disable-next-line import/first
import { NativeRecorderError, useExpoRecorderAdapter } from '../expo-recorder-adapter';

describe('ExpoRecorderAdapter native duration contract', () => {
  let now = 1_000;
  let prepared = false;

  beforeEach(() => {
    jest.clearAllMocks();
    now = 1_000;
    prepared = false;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    mockRecorder.isRecording = false;
    mockRecorder.prepareToRecordAsync.mockImplementation(async () => { prepared = true; });
    mockRecorder.record.mockImplementation(() => { mockRecorder.isRecording = true; });
    mockRecorder.stop.mockImplementation(async () => { mockRecorder.isRecording = false; });
    mockRecorder.getStatus.mockImplementation(() => ({
      canRecord: prepared || mockRecorder.isRecording,
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
      format: 'm4a',
      meteringDetected: true,
      uri: mockRecorder.uri,
    });
    await unmount();
  });

  it('classifies a media-services reset during prepare without exposing the native error', async () => {
    mockRecorder.prepareToRecordAsync.mockRejectedValueOnce(new Error('/private/cache/recording.m4a failed'));
    mockRecorder.getStatus.mockReturnValue({
      canRecord: false,
      durationMillis: 0,
      isRecording: false,
      mediaServicesDidReset: true,
      url: null,
    });
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());

    const error = await result.current.prepare().catch((failure) => failure);
    expect(error).toBeInstanceOf(NativeRecorderError);
    expect(error).toEqual(expect.objectContaining({
      code: 'recording_media_services_reset',
      name: 'NativeRecorderError',
    }));
    expect(error.message).not.toContain('/private/cache');
    await unmount();
  });

  it('classifies a recorder that did not enter recording state as a native start failure', async () => {
    mockRecorder.getStatus.mockReturnValue({
      canRecord: true,
      durationMillis: 0,
      isRecording: false,
      mediaServicesDidReset: false,
      url: mockRecorder.uri,
    });
    mockRecorder.record.mockImplementationOnce(() => undefined);
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());

    await act(async () => { await result.current.prepare(); });
    expect(() => result.current.start()).toThrow(expect.objectContaining({
      code: 'recording_native_start_failed',
    }));
    await unmount();
  });
});
