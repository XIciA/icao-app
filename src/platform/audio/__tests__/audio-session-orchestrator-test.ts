import { AudioSessionOrchestrator } from '../audio-session-orchestrator';
import { resetAudioDiagnosticsForTests, setAudioDiagnosticSink } from '../audio-diagnostics';

const mockSetAudioModeAsync = jest.fn(async (_mode: unknown) => undefined);
const mockSetIsAudioActiveAsync = jest.fn(async (_active: boolean) => undefined);

jest.mock('expo-audio', () => ({
  setAudioModeAsync: (mode: unknown) => mockSetAudioModeAsync(mode),
  setIsAudioActiveAsync: (active: boolean) => mockSetIsAudioActiveAsync(active),
}));

async function flush() {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

describe('AudioSessionOrchestrator', () => {
  beforeEach(() => {
    resetAudioDiagnosticsForTests();
    mockSetAudioModeAsync.mockReset();
    mockSetAudioModeAsync.mockResolvedValue(undefined);
    mockSetIsAudioActiveAsync.mockReset();
    mockSetIsAudioActiveAsync.mockResolvedValue(undefined);
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
    mockSetIsAudioActiveAsync.mockImplementation(async (active) => { events.push(active ? 'session-active' : 'session-inactive'); });
    await session.acquire('radio', 'initial');
    events.length = 0;

    await session.acquire('study', 'study-play');

    expect(events).toEqual(['radio-paused', 'mode-set', 'session-active']);
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
    expect(mockSetIsAudioActiveAsync).toHaveBeenLastCalledWith(false);
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

  it('reconciles a late owner pause to idle before allowing a retry', async () => {
    jest.useFakeTimers();
    const session = new AudioSessionOrchestrator();
    let finishLatePause!: () => void;
    const latePause = new Promise<void>((resolve) => { finishLatePause = resolve; });
    const deactivate = jest.fn(() => latePause);
    session.register('radio', { deactivate });
    await session.acquire('radio', 'initial');

    const first = session.acquire('study', 'study-play');
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(first).rejects.toMatchObject({ code: 'owner_pause_timeout' });
    await expect(session.acquire('study', 'study-play')).rejects.toMatchObject({ code: 'owner_pause_timeout' });

    finishLatePause();
    await latePause;
    await flush();
    expect(session.getActiveLeaseForTests()).toBeUndefined();
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: false }));
    expect(mockSetIsAudioActiveAsync).toHaveBeenLastCalledWith(false);
    await expect(session.acquire('study', 'study-play-retry')).resolves.toMatchObject({ owner: 'study' });
    expect(deactivate).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('remains fail-closed when a timed-out owner pause later rejects', async () => {
    jest.useFakeTimers();
    const session = new AudioSessionOrchestrator();
    let rejectLatePause!: (error: Error) => void;
    const latePause = new Promise<void>((_resolve, reject) => { rejectLatePause = reject; });
    session.register('radio', { deactivate: () => latePause });
    await session.acquire('radio', 'initial');

    const first = session.acquire('study', 'study-play');
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(first).rejects.toMatchObject({ code: 'owner_pause_timeout' });
    rejectLatePause(new Error('native pause failed'));
    await latePause.catch(() => undefined);
    await flush();

    expect(session.getActiveLeaseForTests()?.owner).toBe('radio');
    await expect(session.acquire('study', 'study-play-retry')).rejects.toMatchObject({
      code: 'owner_pause_timeout',
    });
    jest.useRealTimers();
  });

  it('does not publish a new owner when the native mode switch fails', async () => {
    const session = new AudioSessionOrchestrator();
    mockSetAudioModeAsync.mockRejectedValueOnce(new Error('native failure'));

    await expect(session.acquire('study', 'study-play')).rejects.toMatchObject({ code: 'mode_switch_failed' });
    expect(session.getActiveLeaseForTests()).toBeUndefined();
    await flush();
    expect(mockSetIsAudioActiveAsync).toHaveBeenLastCalledWith(false);
  });

  it('does not publish a new owner when explicit session activation fails', async () => {
    const session = new AudioSessionOrchestrator();
    mockSetIsAudioActiveAsync.mockRejectedValueOnce(new Error('native activation failure'));

    await expect(session.acquire('study', 'study-play')).rejects.toMatchObject({ code: 'mode_switch_failed' });
    expect(session.getActiveLeaseForTests()).toBeUndefined();
    await flush();
    expect(mockSetIsAudioActiveAsync).toHaveBeenLastCalledWith(false);
  });

  it('recovers on the next request after a settled mode failure and failed idle reconciliation', async () => {
    const session = new AudioSessionOrchestrator();
    mockSetAudioModeAsync
      .mockRejectedValueOnce(new Error('temporary native mode failure'))
      .mockRejectedValueOnce(new Error('native session still interrupted'));

    await expect(session.acquire('study', 'study-play')).rejects.toMatchObject({ code: 'mode_switch_failed' });
    await flush();
    expect(session.getActiveLeaseForTests()).toBeUndefined();

    await expect(session.acquire('recording', 'recording-start')).resolves.toMatchObject({ owner: 'recording' });
    expect(mockSetIsAudioActiveAsync.mock.calls.map(([active]) => active)).toEqual([false, true]);
  });

  it('keeps failed recovery closed but allows a later settled recovery attempt', async () => {
    const session = new AudioSessionOrchestrator();
    mockSetAudioModeAsync.mockRejectedValue(new Error('interrupted'));
    await expect(session.acquire('study', 'play')).rejects.toMatchObject({ code: 'mode_switch_failed' });
    await flush();
    await expect(session.acquire('recording', 'record')).rejects.toMatchObject({ code: 'mode_switch_failed' });
    expect(mockSetIsAudioActiveAsync).not.toHaveBeenCalled();
    expect(session.getActiveLeaseForTests()).toBeUndefined();
    mockSetAudioModeAsync.mockResolvedValue(undefined);
    await expect(session.acquire('study', 'play-again')).resolves.toMatchObject({ owner: 'study' });
  });

  it('does not overlap a timed-out recovery with another native transition', async () => {
    jest.useFakeTimers();
    const session = new AudioSessionOrchestrator();
    mockSetAudioModeAsync.mockRejectedValueOnce(new Error('mode')).mockRejectedValueOnce(new Error('idle'));
    await expect(session.acquire('study', 'play')).rejects.toMatchObject({ code: 'mode_switch_failed' });
    await flush();
    let finishRecovery!: () => void;
    mockSetAudioModeAsync.mockImplementationOnce(() => new Promise<undefined>(resolve => { finishRecovery = () => resolve(undefined); }));
    const retry = session.acquire('recording', 'record');
    const assertion = expect(retry).rejects.toMatchObject({ code: 'mode_switch_timeout' });
    await jest.advanceTimersByTimeAsync(2_000);
    await assertion;
    await expect(session.acquire('study', 'play-again')).rejects.toMatchObject({ code: 'mode_switch_failed' });
    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(3);
    finishRecovery();
    await flush();
    await expect(session.acquire('study', 'play-after-settlement')).resolves.toMatchObject({ owner: 'study' });
    jest.useRealTimers();
  });

  it('reconciles a late activation before allowing a new owner', async () => {
    jest.useFakeTimers();
    const session = new AudioSessionOrchestrator();
    let finishLateActivation!: () => void;
    const lateActivation = new Promise<undefined>((resolve) => {
      finishLateActivation = () => resolve(undefined);
    });
    mockSetIsAudioActiveAsync
      .mockImplementationOnce(() => lateActivation)
      .mockResolvedValue(undefined);

    const first = session.acquire('recording', 'recording-start');
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(first).rejects.toMatchObject({ code: 'mode_switch_timeout' });
    await expect(session.acquire('study', 'study-play')).rejects.toMatchObject({ code: 'mode_switch_timeout' });

    finishLateActivation();
    await lateActivation;
    await flush();
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: false }));
    expect(mockSetIsAudioActiveAsync).toHaveBeenLastCalledWith(false);
    await expect(session.acquire('study', 'study-play-retry')).resolves.toMatchObject({ owner: 'study' });
    jest.useRealTimers();
  });

  it('reconciles a rejected final deactivation before allowing a new owner', async () => {
    const session = new AudioSessionOrchestrator();
    const lease = await session.acquire('recording', 'recording-start');
    mockSetIsAudioActiveAsync.mockRejectedValueOnce(new Error('native deactivation failure'));

    await expect(session.release(lease)).rejects.toMatchObject({ code: 'mode_switch_failed' });
    expect(session.getActiveLeaseForTests()).toBeUndefined();
    await flush();
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: false }));
    expect(mockSetIsAudioActiveAsync).toHaveBeenLastCalledWith(false);
    await expect(session.acquire('study', 'study-play-retry')).resolves.toMatchObject({ owner: 'study' });
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

  it('fails closed when final session deactivation does not settle', async () => {
    jest.useFakeTimers();
    const session = new AudioSessionOrchestrator();
    const lease = await session.acquire('recording', 'recording-start');
    mockSetIsAudioActiveAsync.mockImplementationOnce(() => new Promise<undefined>(() => undefined));

    const release = session.release(lease);
    await jest.advanceTimersByTimeAsync(2_000);

    await expect(release).rejects.toMatchObject({ code: 'mode_switch_timeout' });
    expect(session.getActiveLeaseForTests()).toBeUndefined();
    await expect(session.acquire('study', 'study-play')).rejects.toMatchObject({ code: 'mode_switch_timeout' });
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
    await flush();
    await expect(session.acquire('study', 'study-play')).resolves.toMatchObject({ owner: 'study' });
    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(3);
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
    expect(mockSetIsAudioActiveAsync).toHaveBeenLastCalledWith(false);
  });
});
