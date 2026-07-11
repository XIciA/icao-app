import { render, waitFor } from '@testing-library/react-native';
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
});
