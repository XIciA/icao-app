import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { StudyAudioPlayer } from '../components/StudyAudioPlayer';

const mockPlayer = {
  pause: jest.fn(),
  play: jest.fn(),
  replace: jest.fn(),
  seekTo: jest.fn(async () => undefined),
  setPlaybackRate: jest.fn(),
  playing: false,
};

let mockStatus = {
  currentTime: 0,
  didJustFinish: false,
  duration: 10,
  isBuffering: true,
  isLoaded: false,
  playbackState: 'loading',
  playing: false,
};

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
}));

describe('StudyAudioPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = { ...mockStatus, isBuffering: true, isLoaded: false, playbackState: 'loading', playing: false };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('waits for the replacement source to load before first-card or navigation autoplay', async () => {
    const screen = await render(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence1" playbackKey="card-1" uri="https://example.test/card-1.mp3" />,
    );

    expect(mockPlayer.replace).toHaveBeenCalledWith('https://example.test/card-1.mp3');
    expect(mockPlayer.play).not.toHaveBeenCalled();

    mockStatus = { ...mockStatus, isBuffering: false, isLoaded: true, playbackState: 'readyToPlay' };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence1" playbackKey="card-1" uri="https://example.test/card-1.mp3" />,
    );

    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));
  });

  it('drops pending navigation autoplay when the app backgrounds during loading', async () => {
    let appStateListener: ((state: 'active' | 'background' | 'inactive') => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });

    const screen = await render(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence2" playbackKey="card-2" uri="https://example.test/card-2.mp3" />,
    );
    appStateListener?.('background');

    mockStatus = { ...mockStatus, isBuffering: false, isLoaded: true, playbackState: 'readyToPlay' };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence2" playbackKey="card-2" uri="https://example.test/card-2.mp3" />,
    );

    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('drops pending autoplay after an audio load error instead of playing later', async () => {
    const screen = await render(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence2" playbackKey="card-error" uri="https://example.test/card-error.mp3" />,
    );

    mockStatus = { ...mockStatus, isBuffering: false, isLoaded: false, playbackState: 'error' };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence2" playbackKey="card-error" uri="https://example.test/card-error.mp3" />,
    );
    mockStatus = { ...mockStatus, isLoaded: true, playbackState: 'readyToPlay' };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence2" playbackKey="card-error" uri="https://example.test/card-error.mp3" />,
    );

    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('cancels pending autoplay when recording takes audio ownership', async () => {
    const screen = await render(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence2" pauseRequest={0} playbackKey="card-record" uri="https://example.test/card-record.mp3" />,
    );
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence2" pauseRequest={1} playbackKey="card-record" uri="https://example.test/card-record.mp3" />,
    );
    mockStatus = { ...mockStatus, isBuffering: false, isLoaded: true, playbackState: 'readyToPlay' };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence2" pauseRequest={1} playbackKey="card-record" uri="https://example.test/card-record.mp3" />,
    );

    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('turns endless buffering into a retryable timeout state', async () => {
    jest.useFakeTimers();
    const onRetry = jest.fn();
    const screen = await render(
      <StudyAudioPlayer label="Sentence3" onRetry={onRetry} playbackKey="card-3" uri="https://example.test/card-3.mp3" />,
    );

    await screen.rerender(
      <StudyAudioPlayer label="Sentence3" onRetry={onRetry} playbackKey="card-3" uri="https://example.test/card-3.mp3" />,
    );
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
    expect(screen.getByText('音频加载超时')).toBeTruthy();
    expect(screen.getByText('连接可能已中断；重试会重新获取音频地址。')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('重试音频'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(mockPlayer.replace).toHaveBeenCalledTimes(2);
  });

  it('pauses immediately when the page sends a mutual-exclusion request', async () => {
    mockStatus = { ...mockStatus, isBuffering: false, isLoaded: true, playbackState: 'readyToPlay', playing: true };
    const screen = await render(
      <StudyAudioPlayer label="Sentence4" pauseRequest={0} playbackKey="card-4" uri="https://example.test/card-4.mp3" />,
    );
    mockPlayer.pause.mockClear();

    await screen.rerender(
      <StudyAudioPlayer label="Sentence4" pauseRequest={1} playbackKey="card-4" uri="https://example.test/card-4.mp3" />,
    );

    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('seeks to the beginning before replaying naturally completed audio', async () => {
    mockStatus = { ...mockStatus, currentTime: 10, didJustFinish: true, duration: 10, isBuffering: false, isLoaded: true, playbackState: 'readyToPlay', playing: false };
    const onPlaybackStart = jest.fn();
    const screen = await render(
      <StudyAudioPlayer label="Sentence5" onPlaybackStart={onPlaybackStart} playbackKey="card-5" uri="https://example.test/card-5.mp3" />,
    );
    mockPlayer.seekTo.mockClear();
    mockPlayer.play.mockClear();

    fireEvent.press(screen.getByLabelText('播放'));

    await waitFor(() => expect(mockPlayer.seekTo).toHaveBeenCalledWith(0));
    expect(onPlaybackStart).toHaveBeenCalledTimes(1);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(mockPlayer.seekTo.mock.invocationCallOrder[0]).toBeLessThan(mockPlayer.play.mock.invocationCallOrder[0]);
  });

  it('shows all explicit speed choices instead of cycling blindly', async () => {
    mockStatus = { ...mockStatus, isBuffering: false, isLoaded: true, playbackState: 'readyToPlay', playing: false };
    const screen = await render(
      <StudyAudioPlayer label="Sentence6" playbackKey="card-6" uri="https://example.test/card-6.mp3" />,
    );

    fireEvent.press(screen.getByLabelText('播放速度 1 倍'));

    await waitFor(() => expect(screen.getByLabelText('0.75 倍')).toBeTruthy());
    expect(screen.getByLabelText('1 倍')).toBeTruthy();
    expect(screen.getByLabelText('1.25 倍')).toBeTruthy();
    expect(screen.getByLabelText('1.5 倍')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('1.25 倍'));
    expect(mockPlayer.setPlaybackRate).toHaveBeenLastCalledWith(1.25);
  });
});
