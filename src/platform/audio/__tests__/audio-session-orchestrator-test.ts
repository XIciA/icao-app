import { AudioSessionOrchestrator } from '../audio-session-orchestrator';
import { resetAudioDiagnosticsForTests, setAudioDiagnosticSink } from '../audio-diagnostics';

const mockSetAudioModeAsync = jest.fn(async (_mode: unknown) => undefined);

jest.mock('expo-audio', () => ({
  setAudioModeAsync: (mode: unknown) => mockSetAudioModeAsync(mode),
}));

describe('AudioSessionOrchestrator', () => {
  beforeEach(() => {
    resetAudioDiagnosticsForTests();
    mockSetAudioModeAsync.mockReset();
    mockSetAudioModeAsync.mockResolvedValue(undefined);
  });

  afterEach(() => resetAudioDiagnosticsForTests());

  it('does not let a failing diagnostics sink break session ownership', async () => {
    const session = new AudioSessionOrchestrator();
    setAudioDiagnosticSink(() => { throw new Error('monitor unavailable'); });

    const lease = await session.acquire('study', 'study-play');

    expect(lease.owner).toBe('study');
    expect(session.getActiveLeaseForTests()).toEqual(lease);
  });

  it('awaits the previous owner before applying the next profile', async () => {
    const events: string[] = [];
    const session = new AudioSessionOrchestrator();
    session.register('radio', {
      deactivate: async () => {
        await Promise.resolve();
        events.push('radio-paused');
      },
    });
    mockSetAudioModeAsync.mockImplementation(async () => { events.push('mode-set'); });
    await session.acquire('radio', 'initial');
    events.length = 0;

    await session.acquire('study', 'study-play');

    expect(events).toEqual(['radio-paused', 'mode-set']);
  });

  it('rejects playback while recording owns the session', async () => {
    const session = new AudioSessionOrchestrator();
    await session.acquire('recording', 'record-start');

    await expect(session.acquire('radio', 'radio-play')).rejects.toMatchObject({
      code: 'recording_exclusive',
    });
  });

  it('ignores a stale lease release and restores idle for the current lease', async () => {
    const session = new AudioSessionOrchestrator();
    const first = await session.acquire('study', 'first');
    const current = await session.acquire('study', 'second');

    await session.release(first);
    expect(session.getActiveLeaseForTests()).toEqual(current);
    await session.release(current);

    expect(session.getActiveLeaseForTests()).toBeUndefined();
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: false, shouldPlayInBackground: false }));
  });

  it('fails closed when the previous owner does not pause in time', async () => {
    jest.useFakeTimers();
    const session = new AudioSessionOrchestrator();
    session.register('radio', { deactivate: () => new Promise<void>(() => undefined) });
    await session.acquire('radio', 'initial');
    const transition = session.acquire('study', 'study-play');
    await jest.advanceTimersByTimeAsync(2_000);

    await expect(transition).rejects.toMatchObject({ code: 'owner_pause_timeout' });
    expect(session.getActiveLeaseForTests()?.owner).toBe('radio');
    jest.useRealTimers();
  });

  it('reconciles a late owner pause by requiring the idempotent pause again on retry', async () => {
    jest.useFakeTimers();
    const session = new AudioSessionOrchestrator();
    let finishLatePause!: () => void;
    const latePause = new Promise<void>((resolve) => { finishLatePause = resolve; });
    const deactivate = jest.fn()
      .mockImplementationOnce(() => latePause)
      .mockResolvedValueOnce(undefined);
    session.register('radio', { deactivate });
    await session.acquire('radio', 'initial');

    const first = session.acquire('study', 'study-play');
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(first).rejects.toMatchObject({ code: 'owner_pause_timeout' });
    await expect(session.acquire('study', 'study-play')).rejects.toMatchObject({ code: 'owner_pause_timeout' });

    finishLatePause();
    await latePause;
    await Promise.resolve();
    await expect(session.acquire('study', 'study-play-retry')).resolves.toMatchObject({ owner: 'study' });
    expect(deactivate).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('does not publish a new owner when the native mode switch fails', async () => {
    const session = new AudioSessionOrchestrator();
    mockSetAudioModeAsync.mockRejectedValueOnce(new Error('native failure'));

    await expect(session.acquire('study', 'study-play')).rejects.toMatchObject({ code: 'mode_switch_failed' });
    expect(session.getActiveLeaseForTests()).toBeUndefined();
  });

  it('distinguishes a native mode switch timeout from an immediate failure', async () => {
    jest.useFakeTimers();
    const session = new AudioSessionOrchestrator();
    mockSetAudioModeAsync.mockImplementationOnce(() => new Promise<undefined>(() => undefined));
    const transition = session.acquire('recording', 'recording-start');

    await jest.advanceTimersByTimeAsync(2_000);

    await expect(transition).rejects.toMatchObject({ code: 'mode_switch_timeout' });
    expect(session.getActiveLeaseForTests()).toBeUndefined();
    jest.useRealTimers();
  });

  it('fails later owners quickly until a timed-out native mode switch really settles', async () => {
    jest.useFakeTimers();
    const session = new AudioSessionOrchestrator();
    let finishLateSwitch!: () => void;
    const lateSwitch = new Promise<undefined>((resolve) => {
      finishLateSwitch = () => resolve(undefined);
    });
    mockSetAudioModeAsync
      .mockImplementationOnce(() => lateSwitch)
      .mockResolvedValueOnce(undefined);
    const first = session.acquire('recording', 'recording-start');
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(first).rejects.toMatchObject({ code: 'mode_switch_timeout' });

    const second = session.acquire('study', 'study-play');
    await expect(second).rejects.toMatchObject({ code: 'mode_switch_timeout' });
    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1);

    finishLateSwitch();
    await lateSwitch;
    await Promise.resolve();
    await expect(session.acquire('study', 'study-play')).resolves.toMatchObject({ owner: 'study' });
    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('does not leave a second request pending forever when a native switch never settles', async () => {
    jest.useFakeTimers();
    const session = new AudioSessionOrchestrator();
    mockSetAudioModeAsync.mockImplementationOnce(() => new Promise<undefined>(() => undefined));
    const first = session.acquire('recording', 'recording-start');
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(first).rejects.toMatchObject({ code: 'mode_switch_timeout' });

    await expect(session.acquire('study', 'study-play')).rejects.toMatchObject({
      code: 'mode_switch_timeout',
    });
    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('fails closed when the previous owner rejects deactivation', async () => {
    const session = new AudioSessionOrchestrator();
    session.register('radio', { deactivate: async () => { throw new Error('pause failed'); } });
    await session.acquire('radio', 'initial');

    await expect(session.acquire('study', 'study-play')).rejects.toMatchObject({ code: 'owner_pause_failed' });
    expect(session.getActiveLeaseForTests()?.owner).toBe('radio');
  });

  it('fails closed if an active owner loses its registered deactivator', async () => {
    const session = new AudioSessionOrchestrator();
    const unregister = session.register('radio', { deactivate: async () => undefined });
    await session.acquire('radio', 'initial');
    unregister();

    await expect(session.acquire('study', 'study-play')).rejects.toMatchObject({ code: 'owner_pause_failed' });
    expect(session.getActiveLeaseForTests()?.owner).toBe('radio');
  });

  it('releases recording to idle without restoring the previous player', async () => {
    const deactivateRadio = jest.fn(async () => undefined);
    const session = new AudioSessionOrchestrator();
    session.register('radio', { deactivate: deactivateRadio });
    await session.acquire('radio', 'radio-play');
    const recording = await session.acquire('recording', 'recording-start');

    await session.release(recording);

    expect(deactivateRadio).toHaveBeenCalledTimes(1);
    expect(session.getActiveLeaseForTests()).toBeUndefined();
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: false, shouldPlayInBackground: false }));
  });
});
