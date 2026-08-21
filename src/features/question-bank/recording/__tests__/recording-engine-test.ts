import { RecordingEngine } from '../recording-engine';
import type {
  RawRecording,
  RecorderPort,
  RecorderRuntimeEvent,
  RecordingAsset,
} from '../types';

jest.mock('@/platform/audio', () => ({ emitAudioDiagnostic: jest.fn() }));
jest.mock('@/platform/diagnostics/safe-diagnostic-store', () => ({ recordSafeDiagnosticEvent: jest.fn() }));

const { emitAudioDiagnostic: mockEmitAudioDiagnostic } = jest.requireMock('@/platform/audio') as {
  emitAudioDiagnostic: jest.Mock;
};

type Deferred<T> = { promise: Promise<T>; reject: (error: unknown) => void; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, reject, resolve };
}

const rawRecording: Extract<RawRecording, { kind: 'native-file' }> = {
  durationMs: 1_000,
  format: 'm4a',
  kind: 'native-file',
  mimeType: 'audio/mp4',
  recorderMimeType: 'audio/mp4',
  uri: 'file:///raw.m4a',
};

const committedAsset: RecordingAsset = {
  byteSize: 8_000,
  cardId: 'card-1',
  createdAt: '2026-08-20T00:00:00.000Z',
  durationMillis: 1_000,
  format: 'm4a',
  id: 'asset-1',
  mimeType: 'audio/mp4',
  recorderMimeType: 'audio/mp4',
  sessionId: 'session-1',
  storageKind: 'native-file',
  uri: 'file:///committed.m4a',
};

class FakeRuntime implements RecorderPort {
  isWeb = false;
  listeners = new Set<(event: RecorderRuntimeEvent) => void>();
  cancel = jest.fn(async () => undefined as RawRecording | undefined);
  dispose = jest.fn(async () => undefined);
  getSnapshot = jest.fn(() => ({
    canRecord: true,
    durationMs: 1_000,
    isRecording: true,
    mediaServicesDidReset: false,
    state: 'recording' as const,
  }));
  prepare = jest.fn(async () => undefined);
  requestPermission = jest.fn(async () => true);
  start = jest.fn(async () => undefined);
  stop = jest.fn(async () => rawRecording as RawRecording);
  subscribe(listener: (event: RecorderRuntimeEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event: RecorderRuntimeEvent) { this.listeners.forEach((listener) => listener(event)); }
}

async function flush() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

function setup(recording?: RecordingAsset) {
  let now = 0;
  const runtime = new FakeRuntime();
  const onRecorded = jest.fn();
  const repository = {
    commitRaw: jest.fn(async () => committedAsset),
    discard: jest.fn(),
    discardRaw: jest.fn(),
  };
  const audioSession = {
    acquire: jest.fn(async () => ({ owner: 'recording' as const, token: 1 })),
    getActiveOwner: jest.fn(() => 'recording'),
    release: jest.fn(async () => undefined),
  };
  const engine = new RecordingEngine({
    audioSession,
    config: {
      cardId: 'card-1',
      onClear: jest.fn(),
      onRecorded,
      recording,
      sessionId: 'session-1',
    },
    now: () => now,
    repository,
  });
  engine.attachRuntime(runtime, 0);
  return { audioSession, engine, onRecorded, repository, runtime, setNow: (value: number) => { now = value; } };
}

describe('RecordingEngine lifecycle contract', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    mockEmitAudioDiagnostic.mockClear();
  });

  it('cancels cleanly when released during permission', async () => {
    const permission = deferred<boolean>();
    const { audioSession, engine, repository, runtime } = setup();
    runtime.requestPermission.mockReturnValue(permission.promise);
    engine.pressIn();
    await flush();
    const release = engine.pressOut();
    permission.resolve(true);
    await release;
    expect(runtime.prepare).not.toHaveBeenCalled();
    expect(runtime.cancel).toHaveBeenCalledTimes(1);
    expect(repository.discardRaw).not.toHaveBeenCalled();
    expect(audioSession.acquire).not.toHaveBeenCalled();
    expect(engine.getSnapshot().phase).toBe('idle');
  });

  it('releases a late audio-session lease without preparing', async () => {
    const lease = deferred<{ owner: 'recording'; token: number }>();
    const { audioSession, engine, runtime } = setup();
    audioSession.acquire.mockReturnValue(lease.promise);
    engine.pressIn();
    await flush();
    const release = engine.pressOut();
    lease.resolve({ owner: 'recording', token: 7 });
    await release;
    expect(runtime.prepare).not.toHaveBeenCalled();
    expect(runtime.cancel).toHaveBeenCalledTimes(1);
    expect(audioSession.release).toHaveBeenCalledWith({ owner: 'recording', token: 7 });
  });

  it('cancels after a late prepare without calling start', async () => {
    const preparation = deferred<undefined>();
    const { audioSession, engine, runtime } = setup();
    runtime.prepare.mockReturnValue(preparation.promise);
    engine.pressIn();
    await flush();
    const release = engine.pressOut();
    preparation.resolve(undefined);
    await release;
    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.cancel).toHaveBeenCalledTimes(1);
    expect(audioSession.release).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().runtimeEpoch).toBe(1);
  });

  it('releases the audio session and reports only the sanitized native prepare reason', async () => {
    const nativeFailure = Object.assign(new Error('recording_native_prepare_failed'), {
      code: 'recording_native_prepare_failed',
      diagnosticReason: 'native-recorder-prepare',
    });
    const { audioSession, engine, runtime } = setup();
    runtime.prepare.mockRejectedValueOnce(nativeFailure);

    engine.pressIn();
    await flush();

    expect(audioSession.release).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().error?.code).toBe('recording_native_prepare_failed');
    expect(mockEmitAudioDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      code: 'recording_native_prepare_failed',
      reason: 'native-recorder-prepare',
    }));
    expect(mockEmitAudioDiagnostic).not.toHaveBeenCalledWith(expect.objectContaining({
      reason: expect.stringContaining('recording_native_prepare_failed'),
    }));
  });

  it('stops and discards when start acknowledges after the finger was released', async () => {
    const started = deferred<undefined>();
    const { engine, onRecorded, repository, runtime } = setup();
    runtime.start.mockReturnValue(started.promise);
    engine.pressIn();
    await flush();
    const release = engine.pressOut();
    started.resolve(undefined);
    await release;
    expect(runtime.stop).toHaveBeenCalledTimes(1);
    expect(repository.discardRaw).toHaveBeenCalledWith(expect.objectContaining({ kind: 'native-file' }));
    expect(repository.commitRaw).not.toHaveBeenCalled();
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it('coalesces repeated stop requests into one platform stop and one commit', async () => {
    const stopped = deferred<RawRecording>();
    const { engine, onRecorded, repository, runtime, setNow } = setup();
    runtime.stop.mockReturnValue(stopped.promise);
    engine.pressIn();
    await flush();
    expect(engine.getSnapshot().phase).toBe('recording');
    setNow(1_000);
    const first = engine.pressOut();
    const second = engine.pressOut();
    await flush();
    expect(runtime.stop).toHaveBeenCalledTimes(1);
    stopped.resolve(rawRecording);
    await Promise.all([first, second]);
    expect(repository.commitRaw).toHaveBeenCalledTimes(1);
    expect(onRecorded).toHaveBeenCalledWith(committedAsset);
    expect(engine.getSnapshot().phase).toBe('ready');
  });

  it('turns recorder self-finish into interruption and preserves the old asset', async () => {
    const { engine, onRecorded, repository, runtime, setNow } = setup(committedAsset);
    engine.pressIn();
    await flush();
    setNow(1_000);
    runtime.emit({ context: { operationId: 1, runtimeEpoch: 0 }, type: 'finished' });
    await flush();
    expect(runtime.stop).toHaveBeenCalledTimes(1);
    expect(repository.discardRaw).toHaveBeenCalled();
    expect(repository.commitRaw).not.toHaveBeenCalled();
    expect(onRecorded).not.toHaveBeenCalled();
    expect(engine.getSnapshot()).toMatchObject({ asset: committedAsset, phase: 'ready' });
    expect(engine.getSnapshot().error?.code).toBe('recording_interrupted');
  });

  it('isolates a media-services reset and preserves the old asset', async () => {
    const { engine, onRecorded, repository, runtime, setNow } = setup(committedAsset);
    engine.pressIn();
    await flush();
    setNow(1_000);
    runtime.emit({
      context: { operationId: 1, runtimeEpoch: 0 },
      reason: 'media-services-reset',
      type: 'interrupted',
    });
    await flush();
    expect(runtime.stop).toHaveBeenCalledTimes(1);
    expect(repository.discardRaw).toHaveBeenCalled();
    expect(repository.commitRaw).not.toHaveBeenCalled();
    expect(onRecorded).not.toHaveBeenCalled();
    expect(engine.getSnapshot()).toMatchObject({ asset: committedAsset, phase: 'ready' });
    expect(engine.getSnapshot().error?.code).toBe('recording_media_services_reset');
  });

  it('preserves the interruption reason when platform cleanup itself fails', async () => {
    const { engine, runtime } = setup();
    runtime.stop.mockRejectedValueOnce(new Error('native recorder already stopped'));
    engine.pressIn();
    await flush();
    runtime.emit({ context: { operationId: 1, runtimeEpoch: 0 }, type: 'finished' });
    await flush();
    expect(engine.getSnapshot().error?.code).toBe('recording_interrupted');
  });

  it('commits to the card that owned the operation even if the visible card changes', async () => {
    const { engine, onRecorded, repository, setNow } = setup();
    const nextCardRecorded = jest.fn();
    engine.pressIn();
    await flush();
    engine.configure({
      cardId: 'card-2',
      onClear: jest.fn(),
      onRecorded: nextCardRecorded,
      recording: undefined,
      sessionId: 'session-2',
    });
    setNow(1_000);
    await engine.pressOut();
    expect(repository.commitRaw).toHaveBeenCalledWith(expect.objectContaining({
      cardId: 'card-1',
      sessionId: 'session-1',
    }));
    expect(onRecorded).toHaveBeenCalledWith(committedAsset);
    expect(nextCardRecorded).not.toHaveBeenCalled();
  });

  it('discards a committed asset if publication fails', async () => {
    const { engine, onRecorded, repository, setNow } = setup();
    onRecorded.mockImplementationOnce(() => { throw new Error('session update failed'); });
    engine.pressIn();
    await flush();
    setNow(1_000);
    await engine.pressOut();
    expect(repository.discard).toHaveBeenCalledWith(committedAsset);
    expect(engine.getSnapshot().error?.code).toBe('recording_commit_failed');
  });

  it('does not ask the Engine to discard a Raw after commit ownership transferred', async () => {
    const { engine, repository, setNow } = setup();
    repository.commitRaw.mockRejectedValueOnce(new Error('copy failed'));
    engine.pressIn();
    await flush();
    setNow(1_000);
    await engine.pressOut();
    expect(repository.commitRaw).toHaveBeenCalledTimes(1);
    expect(repository.discardRaw).not.toHaveBeenCalled();
    expect(engine.getSnapshot().error?.code).toBe('record_stop_failed');
  });

  it('taints a timed-out stop, blocks retry, cleans the late Raw, then requests a new runtime epoch', async () => {
    jest.useFakeTimers();
    const stopped = deferred<RawRecording>();
    const { engine, repository, runtime, setNow } = setup();
    runtime.stop.mockReturnValue(stopped.promise);
    engine.pressIn();
    await flush();
    setNow(1_000);
    const release = engine.pressOut();
    await jest.advanceTimersByTimeAsync(5_000);
    await release;
    expect(engine.getSnapshot()).toMatchObject({ runtimeEpoch: 0, runtimeTainted: true });
    expect(engine.getSnapshot().error?.code).toBe('recording_stop_timeout');
    engine.pressIn();
    expect(runtime.start).toHaveBeenCalledTimes(1);
    stopped.resolve(rawRecording);
    await flush();
    expect(repository.discardRaw).toHaveBeenCalledWith(rawRecording);
    expect(engine.getSnapshot()).toMatchObject({ runtimeEpoch: 1, runtimeTainted: false });
    runtime.emit({ context: { operationId: 1, runtimeEpoch: 0 }, type: 'finished' });
    await flush();
    expect(repository.commitRaw).not.toHaveBeenCalled();
  });

  it.each([
    ['prepare', 3_000, 'recording_native_prepare_timeout'],
    ['start', 2_000, 'recording_native_start_timeout'],
  ] as const)('taints and rebuilds after a late native %s', async (stage, timeoutMs, expectedCode) => {
    jest.useFakeTimers();
    const late = deferred<undefined>();
    const { engine, runtime } = setup();
    runtime[stage].mockReturnValue(late.promise);
    engine.pressIn();
    await flush();
    await jest.advanceTimersByTimeAsync(timeoutMs);
    expect(engine.getSnapshot()).toMatchObject({ runtimeEpoch: 0, runtimeTainted: true });
    expect(engine.getSnapshot().error?.code).toBe(expectedCode);
    late.resolve(undefined);
    await flush();
    expect(runtime.cancel).toHaveBeenCalled();
    expect(engine.getSnapshot()).toMatchObject({ runtimeEpoch: 1, runtimeTainted: false });
  });

  it('maximum duration stops only the active operation', async () => {
    jest.useFakeTimers();
    const { engine, runtime, setNow } = setup();
    engine.pressIn();
    await flush();
    setNow(180_000);
    await jest.advanceTimersByTimeAsync(180_000);
    expect(runtime.stop).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().phase).toBe('ready');
  });

  it('uses monotonic duration when native duration violates the unit contract', async () => {
    const { engine, repository, runtime, setNow } = setup();
    runtime.stop.mockResolvedValue({ ...rawRecording, durationMs: 1_000_000 });
    engine.pressIn();
    await flush();
    setNow(2_000);
    await engine.pressOut();
    expect(repository.commitRaw).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 2_000 }));
  });
});
