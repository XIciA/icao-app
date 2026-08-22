import { act, renderHook } from '@testing-library/react-native';

import type { RawRecording, RecorderRuntimeEvent } from '../types';

// Platform suffix is intentional: these contracts exercise browser-only behavior.
import { useExpoRecorderAdapter } from '../expo-recorder-adapter.web';

type Listener = (event: any) => void;

const constructorAttempts: (MediaRecorderOptions | undefined)[] = [];
const recorderInstances: MockMediaRecorder[] = [];
const streams: MockStream[] = [];
const getUserMedia = jest.fn<Promise<MediaStream>, [MediaStreamConstraints]>();
let supportedMimeTypes = new Set<string>();
let rejectConstructor: (options?: MediaRecorderOptions) => boolean = () => false;
let defaultMimeType = 'audio/webm';
let recorderMimeTypeOverride: string | null = null;
let chunkMimeTypeOverride: string | null = null;
let requestDataThrows = false;
let timesliceStartThrows = false;
let stopStalls = false;
let stopDefersEvents = false;

const context = { operationId: 1, runtimeEpoch: 0 };

function namedError(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}

class MockTrack {
  readonly listeners = new Map<string, Set<Listener>>();
  stopped = false;
  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: Listener) { this.listeners.get(type)?.delete(listener); }
  stop() { this.stopped = true; }
  end() { for (const listener of this.listeners.get('ended') ?? []) listener({ type: 'ended' }); }
}

class MockStream {
  readonly track = new MockTrack();
  getTracks() { return [this.track] as unknown as MediaStreamTrack[]; }
}

class MockMediaRecorder {
  static isTypeSupported = jest.fn((mimeType: string) => supportedMimeTypes.has(mimeType));
  readonly listeners = new Map<string, Set<Listener>>();
  readonly mimeType: string;
  readonly startCalls: (number | undefined)[] = [];
  requestDataCalls = 0;
  state: RecordingState = 'inactive';
  stopCalls = 0;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    constructorAttempts.push(options);
    if (rejectConstructor(options)) throw namedError('NotSupportedError');
    this.mimeType = recorderMimeTypeOverride ?? options?.mimeType ?? defaultMimeType;
    recorderInstances.push(this);
  }
  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: Listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type: string, event: any = { type }) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  start(timeslice?: number) {
    this.startCalls.push(timeslice);
    if (timeslice !== undefined && timesliceStartThrows) throw namedError('NotSupportedError');
    this.state = 'recording';
  }
  requestData() {
    this.requestDataCalls += 1;
    if (requestDataThrows) throw namedError('InvalidStateError');
  }
  stop() {
    this.stopCalls += 1;
    if (stopStalls) return;
    this.state = 'inactive';
    if (!stopDefersEvents) this.completeStop();
  }
  completeStop(size = 600) {
    const type = chunkMimeTypeOverride ?? this.mimeType;
    this.dispatch('dataavailable', {
      data: new Blob([new Uint8Array(size)], type ? { type } : undefined),
      type: 'dataavailable',
    });
    this.dispatch('stop');
  }
  interrupt() { this.state = 'inactive'; this.dispatch('stop'); }
  fail(name: string) { this.dispatch('error', { error: namedError(name), type: 'error' }); }
}

const originalDescriptors = {
  createObjectURL: Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
  isSecureContext: Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext'),
  mediaRecorder: Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder'),
  navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
};

function restoreProperty(target: object, key: PropertyKey, descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else delete (target as Record<PropertyKey, unknown>)[key];
}

async function prepare(result: ReturnType<typeof useExpoRecorderAdapter>) {
  await act(async () => { expect(await result.requestPermission()).toBe(true); });
  await act(async () => { await result.prepare(context); });
}

describe('ExpoRecorderAdapter Web runtime contract', () => {
  beforeEach(() => {
    constructorAttempts.length = 0;
    recorderInstances.length = 0;
    streams.length = 0;
    supportedMimeTypes = new Set(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']);
    rejectConstructor = () => false;
    defaultMimeType = 'audio/webm';
    recorderMimeTypeOverride = null;
    chunkMimeTypeOverride = null;
    requestDataThrows = false;
    timesliceStartThrows = false;
    stopStalls = false;
    stopDefersEvents = false;
    Object.defineProperty(MockMediaRecorder, 'isTypeSupported', {
      configurable: true,
      value: jest.fn((mimeType: string) => supportedMimeTypes.has(mimeType)),
      writable: true,
    });
    getUserMedia.mockReset();
    getUserMedia.mockImplementation(async () => {
      const stream = new MockStream();
      streams.push(stream);
      return stream as unknown as MediaStream;
    });
    Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: MockMediaRecorder });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: { getUserMedia },
        permissions: { query: jest.fn(async () => ({ state: 'prompt' })) },
      },
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn() });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    restoreProperty(URL, 'createObjectURL', originalDescriptors.createObjectURL);
    restoreProperty(globalThis, 'isSecureContext', originalDescriptors.isSecureContext);
    restoreProperty(globalThis, 'MediaRecorder', originalDescriptors.mediaRecorder);
    restoreProperty(globalThis, 'navigator', originalDescriptors.navigator);
  });

  it('registers listeners before start and returns final data with the actual MIME', async () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());
    await prepare(result.current);
    const recorder = recorderInstances[0];
    expect(recorder?.listeners.get('dataavailable')?.size).toBe(1);
    expect(recorder?.listeners.get('error')?.size).toBe(1);
    expect(recorder?.listeners.get('stop')?.size).toBe(1);
    await act(async () => { await result.current.start(context); });
    now = 2_000;
    let raw: RawRecording | undefined;
    await act(async () => { raw = await result.current.stop(context); });
    expect(raw).toMatchObject({
      format: 'webm',
      kind: 'web-blob',
      mimeType: 'audio/webm',
      recorderDurationMs: 1_000,
      recorderMimeType: 'audio/webm;codecs=opus',
    });
    expect(raw?.kind === 'web-blob' ? raw.blob.size : 0).toBe(600);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(streams[0]?.track.stopped).toBe(true);
    await unmount();
  });

  it('tries bitrate, then the same MIME without bitrate, before the next candidate', async () => {
    rejectConstructor = (options) => options?.mimeType === 'audio/webm;codecs=opus';
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());
    await prepare(result.current);
    expect(constructorAttempts).toEqual([
      { bitsPerSecond: 128_000, mimeType: 'audio/webm;codecs=opus' },
      { mimeType: 'audio/webm;codecs=opus' },
      { bitsPerSecond: 128_000, mimeType: 'audio/webm' },
    ]);
    await unmount();
  });

  it('uses a recognized final Ogg chunk when the recorder MIME is empty', async () => {
    supportedMimeTypes.clear();
    defaultMimeType = 'audio/ogg;codecs=opus';
    recorderMimeTypeOverride = '';
    chunkMimeTypeOverride = 'audio/ogg;codecs=opus';
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());
    await prepare(result.current);
    await act(async () => { await result.current.start(context); });
    let raw: RawRecording | undefined;
    await act(async () => { raw = await result.current.stop(context); });
    expect(raw).toMatchObject({ format: 'ogg', mimeType: 'audio/ogg' });
    await unmount();
  });

  it('falls back from timeslice start and tolerates requestData failure', async () => {
    timesliceStartThrows = true;
    requestDataThrows = true;
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());
    await prepare(result.current);
    await act(async () => { await result.current.start(context); });
    expect(recorderInstances[0]?.startCalls).toEqual([250, undefined]);
    await act(async () => { await expect(result.current.stop(context)).resolves.toMatchObject({ format: 'webm' }); });
    expect(recorderInstances[0]?.requestDataCalls).toBe(1);
    await unmount();
  });

  it('uses the user stop time rather than delayed finalization for duration', async () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    stopDefersEvents = true;
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());
    await prepare(result.current);
    await act(async () => { await result.current.start(context); });
    now = 2_000;
    let stopPromise!: Promise<RawRecording>;
    await act(() => { stopPromise = result.current.stop(context); });
    now = 6_000;
    await act(() => { recorderInstances[0]?.completeStop(); });
    await expect(stopPromise).resolves.toMatchObject({ recorderDurationMs: 1_000 });
    await unmount();
  });

  it('times out finalization after five seconds and releases tracks', async () => {
    jest.useFakeTimers();
    stopStalls = true;
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());
    await prepare(result.current);
    await act(async () => { await result.current.start(context); });
    const stopPromise = result.current.stop(context);
    await act(async () => {
      jest.advanceTimersByTime(5_000);
      await expect(stopPromise).rejects.toMatchObject({ code: 'recording_finalization_timeout' });
    });
    expect(streams[0]?.track.stopped).toBe(true);
    await unmount();
  });

  it('emits track-ended interruption and never returns a committable asset', async () => {
    const events: RecorderRuntimeEvent[] = [];
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());
    result.current.subscribe((event) => events.push(event));
    await prepare(result.current);
    await act(async () => { await result.current.start(context); });
    await act(() => { streams[0]?.track.end(); });
    await act(async () => {
      await expect(result.current.stop(context)).rejects.toMatchObject({ code: 'recording_interrupted' });
    });
    expect(events).toContainEqual({ context, reason: 'track-ended', type: 'interrupted' });
    expect(recorderInstances[0]?.stopCalls).toBe(1);
    await unmount();
  });

  it('maps MediaRecorder errors and permission failures to typed events', async () => {
    const events: RecorderRuntimeEvent[] = [];
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());
    result.current.subscribe((event) => events.push(event));
    await prepare(result.current);
    await act(async () => { await result.current.start(context); });
    await act(() => { recorderInstances[0]?.fail('NotSupportedError'); });
    await expect(result.current.stop(context)).rejects.toMatchObject({ code: 'recording_browser_unsupported' });
    expect(events).toContainEqual({ code: 'recording_browser_unsupported', context, type: 'error' });
    getUserMedia.mockRejectedValueOnce(namedError('NotReadableError'));
    await expect(result.current.requestPermission()).rejects.toMatchObject({ code: 'microphone_device_unavailable' });
    await unmount();
  });

  it('primes permission without retaining its temporary stream', async () => {
    const { result, unmount } = await renderHook(() => useExpoRecorderAdapter());
    await act(async () => { await expect(result.current.primePermission?.()).resolves.toBe(true); });
    expect(result.current.permissionReady).toBe(true);
    expect(streams[0]?.track.stopped).toBe(true);
    await unmount();
  });
});
