const mockPlayer = {
  addListener: jest.fn(),
  currentStatus: {
    currentTime: 0,
    duration: 3,
    isLoaded: true,
    playbackState: 'ready',
  },
  remove: jest.fn(),
};

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => mockPlayer),
}));

// eslint-disable-next-line import/first
import { recordingMediaProbe } from '../recording-media-probe';

const raw = {
  format: 'm4a' as const,
  kind: 'native-file' as const,
  mimeType: 'audio/mp4',
  recorderDurationMs: 3_000,
  uri: 'file:///recording.m4a',
};

describe('RecordingMediaProbe native decoder contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayer.currentStatus = {
      currentTime: 0,
      duration: 3,
      isLoaded: true,
      playbackState: 'ready',
    };
    mockPlayer.addListener.mockReturnValue({ remove: jest.fn() });
  });

  it('uses decoder metadata as independent playable-duration evidence', async () => {
    await expect(recordingMediaProbe.probe(raw)).resolves.toEqual({
      durationMs: 3_000,
      hasAudioTrack: true,
      playable: true,
    });
    expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
  });

  it('rejects an unloaded zero-duration source and still releases the probe player', async () => {
    jest.useFakeTimers();
    mockPlayer.currentStatus = {
      currentTime: 0,
      duration: 0,
      isLoaded: false,
      playbackState: 'loading',
    };
    const result = recordingMediaProbe.probe(raw);
    const rejection = expect(result).rejects.toThrow('recording_media_unreadable');
    await jest.advanceTimersByTimeAsync(4_000);
    await rejection;
    expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
