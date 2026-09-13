import { ensureRadioTrackPlayer, radioPlaybackService, setRadioContentPlaybackRate, setRadioRemoteHandlers } from '../track-player-runtime';

const mockListeners = new Map<string, (...args: unknown[]) => void>();
const mockSetupPlayer = jest.fn(async (_options: unknown) => undefined);
const mockUpdateOptions = jest.fn(async (_options: unknown) => undefined);
const mockPlay = jest.fn(async () => undefined);
const mockPause = jest.fn(async () => undefined);
const mockSkipToNext = jest.fn(async (_position: number) => undefined);
const mockSkipToPrevious = jest.fn(async (_position: number) => undefined);
const mockSeekTo = jest.fn(async (_position: number) => undefined);
const mockSetRate = jest.fn(async (_rate: number) => undefined);
const mockStop = jest.fn(async () => undefined);

jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {
    addEventListener: (event: string, handler: (...args: unknown[]) => void) => { mockListeners.set(event, handler); },
    pause: () => mockPause(),
    play: () => mockPlay(),
    seekTo: (position: number) => mockSeekTo(position),
    setRate: (rate: number) => mockSetRate(rate),
    setupPlayer: (options: unknown) => mockSetupPlayer(options),
    skipToNext: (position: number) => mockSkipToNext(position),
    skipToPrevious: (position: number) => mockSkipToPrevious(position),
    stop: () => mockStop(),
    updateOptions: (options: unknown) => mockUpdateOptions(options),
  },
  AppKilledPlaybackBehavior: { StopPlaybackAndRemoveNotification: 'stop-playback-and-remove-notification' },
  Capability: { Pause: 'pause', Play: 'play', SeekTo: 'seek-to', SkipToNext: 'next', SkipToPrevious: 'previous' },
  Event: { PlaybackActiveTrackChanged: 'active-track-changed', RemoteDuck: 'remote-duck', RemoteNext: 'remote-next', RemotePause: 'remote-pause', RemotePlay: 'remote-play', RemotePrevious: 'remote-previous', RemoteSeek: 'remote-seek', RemoteStop: 'remote-stop' },
  IOSCategory: { Playback: 'playback' },
  IOSCategoryMode: { SpokenAudio: 'spoken-audio' },
}));

describe('radio track-player runtime', () => {
  beforeEach(() => {
    mockListeners.clear();
    jest.clearAllMocks();
    setRadioRemoteHandlers(undefined);
  });

  it('exposes native previous and next capabilities on the lock screen', async () => {
    await ensureRadioTrackPlayer();

    expect(mockUpdateOptions).toHaveBeenCalledWith(expect.objectContaining({
      capabilities: expect.arrayContaining(['play', 'pause', 'seek-to', 'previous', 'next']),
      notificationCapabilities: expect.arrayContaining(['previous', 'next']),
    }));
  });

  it('routes remote controls through the same radio command handlers', async () => {
    const next = jest.fn(async () => undefined);
    const previous = jest.fn(async () => undefined);
    setRadioRemoteHandlers({
      next,
      pause: jest.fn(),
      play: jest.fn(async () => undefined),
      previous,
      seek: jest.fn(async () => undefined),
      stop: jest.fn(),
    });
    await radioPlaybackService();

    mockListeners.get('remote-next')?.();
    mockListeners.get('remote-previous')?.();
    await Promise.resolve();

    expect(next).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledTimes(1);
    expect(mockSkipToNext).not.toHaveBeenCalled();
    expect(mockSkipToPrevious).not.toHaveBeenCalled();
  });

  it('uses the native media clock for a background interval and restores content rate', async () => {
    setRadioContentPlaybackRate(1.5);
    await radioPlaybackService();

    mockListeners.get('active-track-changed')?.({
      track: { radioTrackKind: 'interval', radioIntervalSeconds: 5 },
    });
    for (let i = 0; i < 12; i += 1) await Promise.resolve();

    expect(mockSetRate).toHaveBeenCalledWith(1);
    expect(mockSeekTo).not.toHaveBeenCalled();

    mockListeners.get('active-track-changed')?.({ track: { radioTrackKind: 'content' } });
    for (let i = 0; i < 12; i += 1) await Promise.resolve();

    expect(mockSetRate).toHaveBeenLastCalledWith(1.5);
  });
});
