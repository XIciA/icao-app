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

  it('waits for the replacement source to load before navigation autoplay', async () => {
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
});
