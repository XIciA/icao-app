import { act, renderHook } from '@testing-library/react-native';
import type { RawRecording } from '../types';

jest.mock('@/platform/audio/audio-diagnostics', () => ({ emitAudioDiagnostic: jest.fn() }));

// Platform suffixes are intentional: these contracts exercise browser-only behavior.
// eslint-disable-next-line import/first
import { useExpoRecorderAdapter } from '../expo-recorder-adapter.web';
// eslint-disable-next-line import/first
import { RecordingRepository } from '../recording-repository.web';

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

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  stop() {
    this.stopped = true;
  }

  end() {
    for (const listener of this.listeners.get('ended') ?? []) listener({ type: 'ended' });
  }
}

class MockStream {
  readonly track = new MockTrack();

  getTracks() {
    return [this.track] as unknown as MediaStreamTrack[];
  }
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

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

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

  interrupt() {
    this.state = 'inactive';
    this.dispatch('stop');
  }

  fail(name: string) {
    this.dispatch('error', { error: namedError(name), type: 'error' });
  }
}

const originalDescriptors = {
  createObjectURL: Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
  isSecureContext: Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext'),
  mediaRecorder: Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder'),
  navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  revokeObjectURL: Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL'),
};

function restoreProperty(target: object, key: PropertyKey, descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else delete (target as Record<PropertyKey, unknown>)[key];
}

async function renderAdapter() {
  return renderHook(() => useExpoRecorderAdapter());
}

async function prepareAdapter(result: ReturnType<typeof useExpoRecorderAdapter>) {
  await act(async () => { expect(await result.requestPermission()).toBe(true); });
  await act(async () => { await result.prepare(); });
}

describe('ExpoRecorderAdapter Web compatibility contract', () => {
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
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:recording-1'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
    });
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
    restoreProperty(URL, 'revokeObjectURL', originalDescriptors.revokeObjectURL);
  });

  it('preserves WebM/Opus at 128 kbps as the first successful path', async () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const { result, unmount } = await renderAdapter();
    await prepareAdapter(result.current);

    expect(constructorAttempts).toEqual([{
      bitsPerSecond: 128_000,
      mimeType: 'audio/webm;codecs=opus',
    }]);

    await act(() => { result.current.start(); });
    now = 2_000;
    let raw: RawRecording | undefined;
    await act(async () => { raw = await result.current.stop(); });

    expect(raw).toMatchObject({
      durationMillis: 1_000,
      format: 'webm',
      uri: 'blob:recording-1',
    });
    expect(raw?.webBlob).toBeInstanceOf(Blob);
    expect(raw?.webBlob?.size).toBe(600);
    expect(raw?.webBlob?.type).toBe('audio/webm');
    expect(result.current.lifecycleRevision).toBe(1);
    await unmount();
  });

  it('retries the same MIME without bitrate before considering another format', async () => {
    rejectConstructor = (options) => options?.mimeType === 'audio/webm;codecs=opus'
      && options.bitsPerSecond !== undefined;
    const { result, unmount } = await renderAdapter();
    await prepareAdapter(result.current);

    expect(constructorAttempts).toEqual([
      { bitsPerSecond: 128_000, mimeType: 'audio/webm;codecs=opus' },
      { mimeType: 'audio/webm;codecs=opus' },
    ]);
    await unmount();
  });

  it('continues to the next MIME after both first-format constructors fail', async () => {
    rejectConstructor = (options) => options?.mimeType === 'audio/webm;codecs=opus';
    const { result, unmount } = await renderAdapter();
    await prepareAdapter(result.current);

    expect(constructorAttempts).toEqual([
      { bitsPerSecond: 128_000, mimeType: 'audio/webm;codecs=opus' },
      { mimeType: 'audio/webm;codecs=opus' },
      { bitsPerSecond: 128_000, mimeType: 'audio/webm' },
    ]);
    await unmount();
  });

  it('tries the ordered constructors when isTypeSupported is unavailable', async () => {
    Object.defineProperty(MockMediaRecorder, 'isTypeSupported', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    const { result, unmount } = await renderAdapter();
    await prepareAdapter(result.current);

    expect(constructorAttempts).toEqual([{
      bitsPerSecond: 128_000,
      mimeType: 'audio/webm;codecs=opus',
    }]);
    await unmount();
  });

  it('uses the browser default only after explicit formats fail and accepts Ogg', async () => {
    supportedMimeTypes.clear();
    defaultMimeType = 'audio/ogg;codecs=opus';
    recorderMimeTypeOverride = '';
    chunkMimeTypeOverride = 'audio/ogg;codecs=opus';
    const { result, unmount } = await renderAdapter();
    await prepareAdapter(result.current);

    expect(constructorAttempts).toEqual([undefined]);
    await act(() => { result.current.start(); });
    let raw: RawRecording | undefined;
    await act(async () => { raw = await result.current.stop(); });
    expect(raw).toMatchObject({ format: 'ogg' });
    expect(raw?.webBlob?.type).toBe('audio/ogg');
    await unmount();
  });

  it('rejects an unknown MIME selected by the default recorder', async () => {
    supportedMimeTypes.clear();
    defaultMimeType = 'audio/flac';
    const { result, unmount } = await renderAdapter();
    await prepareAdapter(result.current);
    await act(() => { result.current.start(); });
    await act(async () => {
      await expect(result.current.stop()).rejects.toMatchObject({ code: 'recording_browser_unsupported' });
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await unmount();
  });

  it('uses a recognized final chunk when an explicit recorder reports an unknown MIME', async () => {
    recorderMimeTypeOverride = 'audio/flac';
    chunkMimeTypeOverride = 'audio/webm;codecs=opus';
    const { result, unmount } = await renderAdapter();
    await prepareAdapter(result.current);
    await act(() => { result.current.start(); });

    let raw: RawRecording | undefined;
    await act(async () => { raw = await result.current.stop(); });
    expect(raw).toMatchObject({ format: 'webm' });
    expect(raw?.webBlob?.type).toBe('audio/webm');
    await unmount();
  });

  it('falls back from start(250), ignores requestData failure, and still finalizes', async () => {
    timesliceStartThrows = true;
    requestDataThrows = true;
    const { result, unmount } = await renderAdapter();
    await prepareAdapter(result.current);
    await act(() => { result.current.start(); });

    expect(recorderInstances[0]?.startCalls).toEqual([250, undefined]);
    await act(async () => { await expect(result.current.stop()).resolves.toMatchObject({ format: 'webm' }); });
    expect(recorderInstances[0]?.requestDataCalls).toBe(1);
    await unmount();
  });

  it('uses the user stop time rather than delayed finalization for duration', async () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    stopDefersEvents = true;
    const { result, unmount } = await renderAdapter();
    await prepareAdapter(result.current);
    await act(() => { result.current.start(); });
    now = 2_000;

    let stopPromise!: Promise<RawRecording>;
    await act(() => { stopPromise = result.current.stop(); });
    now = 6_000;
    await act(() => { recorderInstances[0]?.completeStop(); });
    let raw: RawRecording | undefined;
    await act(async () => { raw = await stopPromise; });

    expect(raw?.durationMillis).toBe(1_000);
    await unmount();
  });

  it('times out finalization after five seconds with a typed error', async () => {
    jest.useFakeTimers();
    stopStalls = true;
    const { result, unmount } = await renderAdapter();
    await prepareAdapter(result.current);
    await act(() => { result.current.start(); });

    let stopPromise!: Promise<RawRecording>;
    await act(() => { stopPromise = result.current.stop(); });
    await act(async () => {
      jest.advanceTimersByTime(5_000);
      await expect(stopPromise).rejects.toMatchObject({ code: 'recording_finalization_timeout' });
    });
    await unmount();
  });

  it('does not turn an external recorder stop into a committable raw asset', async () => {
    const { result, unmount } = await renderAdapter();
    await prepareAdapter(result.current);
    await act(() => { result.current.start(); });
    expect(result.current.lifecycleRevision).toBe(0);
    await act(() => { recorderInstances[0]?.interrupt(); });
    expect(result.current.lifecycleRevision).toBe(1);

    await act(async () => {
      await expect(result.current.stop()).rejects.toMatchObject({ code: 'recording_interrupted' });
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await unmount();
  });

  it('maps a MediaRecorder NotSupportedError event to browser unsupported', async () => {
    const { result, unmount } = await renderAdapter();
    await prepareAdapter(result.current);
    await act(() => { result.current.start(); });
    await act(() => { recorderInstances[0]?.fail('NotSupportedError'); });

    await act(async () => {
      await expect(result.current.stop()).rejects.toMatchObject({ code: 'recording_browser_unsupported' });
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await unmount();
  });

  it('treats track end as interruption, releases capture, and stops only once', async () => {
    const { result, unmount } = await renderAdapter();
    await prepareAdapter(result.current);
    await act(() => { result.current.start(); });
    expect(result.current.durationMillis).toBe(0);
    await act(() => { streams[0]?.track.end(); });
    expect(result.current.lifecycleRevision).toBe(1);

    const firstStop = result.current.stop();
    const secondStop = result.current.stop();
    expect(firstStop).toBe(secondStop);
    await act(async () => {
      await expect(firstStop).rejects.toMatchObject({ code: 'recording_interrupted' });
    });
    expect(streams[0]?.track.stopped).toBe(true);
    expect(recorderInstances[0]?.stopCalls).toBe(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await unmount();
  });

  it('primes permission without retaining its stream and types device failures', async () => {
    const { result, unmount } = await renderAdapter();
    await act(async () => { await expect(result.current.primePermission?.()).resolves.toBe(true); });
    expect(result.current.permissionReady).toBe(true);
    expect(streams[0]?.track.stopped).toBe(true);

    getUserMedia.mockRejectedValueOnce(namedError('NotFoundError'));
    await act(async () => {
      await expect(result.current.primePermission?.()).rejects.toMatchObject({ code: 'microphone_device_missing' });
    });
    expect(result.current.permissionReady).toBe(true);
    await unmount();
  });

  it('remembers a successful primer across Web hook remounts without storage', async () => {
    getUserMedia.mockRejectedValueOnce(namedError('NotAllowedError'));
    const first = await renderAdapter();
    await act(async () => { await expect(first.result.current.primePermission?.()).resolves.toBe(false); });
    expect(first.result.current.permissionReady).toBe(false);
    await act(async () => { await expect(first.result.current.primePermission?.()).resolves.toBe(true); });
    expect(first.result.current.permissionReady).toBe(true);
    await first.unmount();
    const callsBeforeRemount = getUserMedia.mock.calls.length;

    const second = await renderAdapter();
    expect(second.result.current.permissionReady).toBe(true);
    expect(getUserMedia).toHaveBeenCalledTimes(callsBeforeRemount);
    await second.unmount();
  });

  it('guards unsupported browsers before asking for microphone permission', async () => {
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: undefined });
    const { result, unmount } = await renderAdapter();

    await act(async () => {
      await expect(result.current.primePermission?.()).rejects.toMatchObject({ code: 'recording_browser_unsupported' });
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    await unmount();
  });

  it('maps SecurityError to unsupported rather than an ordinary permission denial', async () => {
    getUserMedia.mockRejectedValueOnce(namedError('SecurityError'));
    const { result, unmount } = await renderAdapter();

    await act(async () => {
      await expect(result.current.primePermission?.()).rejects.toMatchObject({ code: 'recording_browser_unsupported' });
    });
    await unmount();
  });

  it.each(['NotSupportedError', 'TypeError'])(
    'maps getUserMedia %s to browser unsupported',
    async (errorType) => {
      getUserMedia.mockRejectedValueOnce(namedError(errorType));
      const { result, unmount } = await renderAdapter();

      await act(async () => {
        await expect(result.current.requestPermission()).rejects.toMatchObject({ code: 'recording_browser_unsupported' });
      });
      await unmount();
    },
  );

  it('maps a busy or unreadable microphone to device unavailable', async () => {
    getUserMedia.mockRejectedValueOnce(namedError('NotReadableError'));
    const { result, unmount } = await renderAdapter();

    await act(async () => {
      await expect(result.current.requestPermission()).rejects.toMatchObject({ code: 'microphone_device_unavailable' });
    });
    await unmount();
  });

  it('does not return or revoke a transferred URI during later cancel or cleanup', async () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const { result, unmount } = await renderAdapter();
    await prepareAdapter(result.current);
    await act(() => { result.current.start(); });
    now = 2_000;
    let raw!: RawRecording;
    await act(async () => { raw = await result.current.stop(); });

    const repository = new RecordingRepository();
    const asset = await repository.commitRaw({
      ...raw,
      cardId: 'card-1',
      sessionId: 'session-1',
    });
    await act(async () => { await expect(result.current.cancel()).resolves.toBeUndefined(); });
    await unmount();

    expect(repository.assetExists(asset)).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    repository.discard(asset);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(raw.uri);
  });
});
