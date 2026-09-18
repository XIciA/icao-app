import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { RawRecording, RecorderRuntimeEvent } from '../types';

let mockStatusListener: ((status: {
  error: string | null;
  hasError: boolean;
  id: string;
  isFinished: boolean;
  mediaServicesDidReset?: boolean;
  url: string | null;
}) => void) | undefined;

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
  getRecordingPermissionsAsync: jest.fn(),
  RecordingPresets: {
    HIGH_QUALITY: {
      bitRate: 128_000,
      extension: '.m4a',
      ios: {
        audioQuality: 127,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
        outputFormat: 'aac',
      },
      numberOfChannels: 2,
      sampleRate: 44_100,
    },
  },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  useAudioRecorder: (_options: unknown, listener?: typeof mockStatusListener) => {
    mockStatusListener = listener;
    return mockRecorder;
  },
  useAudioRecorderState: () => ({ durationMillis: 2_000, isRecording: mockRecorder.isRecording, metering: -30 }),
}));

// Import after the Expo module mock so this test exercises only the adapter contract.
// eslint-disable-next-line import/first
import { IOS_VOICE_RECORDING_OPTIONS, requestMicrophonePermission, useExpoRecorderAdapter } from '../expo-recorder-adapter';

describe('native microphone permission lifecycle', () => {
  const initialPlatform = Platform.OS;
  const permissionApi = jest.requireMock('expo-audio');
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: initialPlatform });
    jest.clearAllMocks();
  });

  it('does not reopen Android permission Activity after a grant', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    permissionApi.getRecordingPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    expect(await requestMicrophonePermission()).toMatchObject({ granted: true });
    expect(permissionApi.requestRecordingPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests Android permission when the user can still grant it', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    permissionApi.getRecordingPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    expect(await requestMicrophonePermission()).toMatchObject({ granted: true });
    expect(permissionApi.requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('returns permanent denial without opening another Android permission Activity', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    permissionApi.getRecordingPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    expect(await requestMicrophonePermission()).toMatchObject({ granted: false });
    expect(permissionApi.requestRecordingPermissionsAsync).not.toHaveBeenCalled();
  });

  it('preserves the iOS permission request path', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    await requestMicrophonePermission();
    expect(permissionApi.getRecordingPermissionsAsync).not.toHaveBeenCalled();
    expect(permissionApi.requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});

describe('ExpoRecorderAdapter native duration contract', () => {
  let now = 1_000;
  let prepared = false;
  const context = { operationId: 1, runtimeEpoch: 0 };

  beforeEach(() => {
    jest.clearAllMocks();
    now = 1_000;
    prepared = false;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    mockRecorder.isRecording = false;
    mockRecorder.prepareToRecordAsync.mockImplementation(async () => { prepared = true; });
    mockRecorder.record.mockImplementation(() => { mockRecorder.isRecording = true; });
    mockRecorder.stop.mockImplementation(async () => {
      mockRecorder.isRecording = false;
      prepared = false;
    });
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

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('keeps native recorder duration independent from wall-clock operation time', async () => {
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());

    await act(async () => { await result.current.prepare(context); });
    await act(async () => { await result.current.start(context); });
    now = 10_000;

    let raw: RawRecording | undefined;
    await act(async () => { raw = await result.current.stop(context); });

    expect(raw).toMatchObject({
      format: 'm4a',
      kind: 'native-file',
      mimeType: 'audio/mp4',
      recorderDurationMs: 2_000,
      uri: mockRecorder.uri,
    });
    await unmount();
  });

  it('uses the unmodified Expo high-quality preset on iOS', async () => {
    const { RecordingPresets: mockRecordingPresets } = jest.requireMock('expo-audio') as {
      RecordingPresets: { HIGH_QUALITY: unknown };
    };

    expect(IOS_VOICE_RECORDING_OPTIONS).toBe(mockRecordingPresets.HIGH_QUALITY);
    expect(IOS_VOICE_RECORDING_OPTIONS).toMatchObject({
      bitRate: 128_000,
      extension: '.m4a',
      numberOfChannels: 2,
      sampleRate: 44_100,
    });
    expect(IOS_VOICE_RECORDING_OPTIONS).not.toEqual(expect.objectContaining({
      bitRate: 64_000,
      numberOfChannels: 1,
      sampleRate: 16_000,
    }));
  });

  it('accepts a resolved native prepare promise without a second canRecord veto', async () => {
    mockRecorder.prepareToRecordAsync.mockResolvedValueOnce(undefined);
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());

    await expect(result.current.prepare(context)).resolves.toBeUndefined();
    expect(mockRecorder.getStatus()).toMatchObject({ canRecord: false });
    await unmount();
  });

  it.each([
    ['Failed to configure audio session: route unavailable', 'audio-session-configuration'],
    ['Failed to prepare recorder', 'native-recorder-prepare'],
    ['Native recorder rejected the request', 'unknown-native-prepare'],
  ] as const)('classifies native prepare failures without retaining their raw message', async (message, reason) => {
    mockRecorder.prepareToRecordAsync.mockRejectedValueOnce(new Error(message));
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());

    await expect(result.current.prepare(context)).rejects.toMatchObject({
      code: 'recording_native_prepare_failed',
      diagnosticReason: reason,
      message: 'recording_native_prepare_failed',
    });
    await unmount();
  });

  it('waits for an explicit recording-state acknowledgement', async () => {
    jest.useFakeTimers();
    mockRecorder.record.mockImplementationOnce(() => undefined);
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());
    await act(async () => { await result.current.prepare(context); });

    let started!: Promise<void>;
    await act(() => { started = result.current.start(context); });
    let settled = false;
    void started.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    mockRecorder.isRecording = true;
    await act(async () => { await jest.advanceTimersByTimeAsync(25); });
    await expect(started).resolves.toBeUndefined();
    await unmount();
    jest.useRealTimers();
  });

  it('does not trust an optimistic status snapshot when the native recorder is not active', async () => {
    jest.useFakeTimers();
    mockRecorder.record.mockImplementationOnce(() => undefined);
    mockRecorder.getStatus.mockImplementation(() => ({
      canRecord: true,
      durationMillis: 2_000,
      isRecording: true,
      mediaServicesDidReset: false,
      url: mockRecorder.uri,
    }));
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());
    await act(async () => { await result.current.prepare(context); });

    let started!: Promise<void>;
    await act(() => { started = result.current.start(context); });
    let settled = false;
    void started.then(() => { settled = true; });
    await act(async () => { await jest.advanceTimersByTimeAsync(50); });
    expect(settled).toBe(false);

    mockRecorder.isRecording = true;
    await act(async () => { await jest.advanceTimersByTimeAsync(25); });
    await expect(started).resolves.toBeUndefined();
    await unmount();
    jest.useRealTimers();
  });

  it('releases a prepared Android-style recorder during cancellation without surfacing its stop error', async () => {
    const events: RecorderRuntimeEvent[] = [];
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());
    result.current.subscribe((event) => events.push(event));
    await act(async () => { await result.current.prepare(context); });

    let raw: RawRecording | undefined;
    await act(async () => { raw = await result.current.cancel(context); });
    await act(() => {
      mockStatusListener?.({
        error: 'stop failed before start',
        hasError: true,
        id: 'native-1',
        isFinished: true,
        url: null,
      });
    });

    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(raw).toMatchObject({ kind: 'native-file', uri: mockRecorder.uri });
    expect(events.some((event) => event.type === 'error' || event.type === 'finished')).toBe(false);
    await unmount();
  });

  it('forwards native finish, error, and media-service reset events with operation context', async () => {
    const events: RecorderRuntimeEvent[] = [];
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());
    result.current.subscribe((event) => events.push(event));
    await act(async () => { await result.current.prepare(context); });
    await act(async () => { await result.current.start(context); });

    const base = { error: null, hasError: false, id: 'native-1', isFinished: false, url: mockRecorder.uri };
    await act(() => { mockStatusListener?.({ ...base, isFinished: true }); });
    await act(() => { mockStatusListener?.({ ...base, error: 'redacted', hasError: true }); });
    await act(() => { mockStatusListener?.({ ...base, mediaServicesDidReset: true }); });

    expect(events).toContainEqual({ context, type: 'finished' });
    expect(events).toContainEqual({ code: 'recording_interrupted', context, type: 'error' });
    expect(events).toContainEqual({ context, reason: 'media-services-reset', type: 'interrupted' });
    await unmount();
  });
});
