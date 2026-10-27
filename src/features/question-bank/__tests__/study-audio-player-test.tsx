import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { audioSessionOrchestrator } from '@/platform/audio';

import {
  StudyAudioPlayer,
  WEB_AUDIO_FIRST_FRAME_TIMEOUT_MS,
} from '../components/StudyAudioPlayer';
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

const mockSetAudioModeAsync = jest.fn(async (_mode: unknown): Promise<void> => undefined);
const mockSetIsAudioActiveAsync = jest.fn(async (_active: boolean): Promise<void> => undefined);

const mockPlayer = {
  pause: jest.fn(),
  play: jest.fn(),
  replace: jest.fn(),
  seekTo: jest.fn(async () => undefined),
  setPlaybackRate: jest.fn(),
  playing: false,
};

function initialMockStatus() {
  return {
    currentTime: 0,
    didJustFinish: false,
    duration: 10,
    isBuffering: true,
    isLoaded: false,
    playbackState: 'loading',
    playing: false,
  };
}

let mockStatus = initialMockStatus();
const initialPlatform = Platform.OS;

function setTestPlatform(platform: 'android' | 'ios' | 'web') {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
}

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('expo-audio', () => ({
  setAudioModeAsync: (mode: unknown) => mockSetAudioModeAsync(mode),
  setIsAudioActiveAsync: (active: boolean) => mockSetIsAudioActiveAsync(active),
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
}));

describe('StudyAudioPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    audioSessionOrchestrator.resetForTests();
    mockSetAudioModeAsync.mockResolvedValue(undefined);
    mockSetIsAudioActiveAsync.mockResolvedValue(undefined);
    mockPlayer.pause.mockImplementation(() => undefined);
    mockPlayer.play.mockImplementation(() => undefined);
    mockPlayer.replace.mockImplementation(() => undefined);
    mockPlayer.seekTo.mockResolvedValue(undefined);
    mockPlayer.setPlaybackRate.mockImplementation(() => undefined);
    mockStatus = initialMockStatus();
    setTestPlatform(initialPlatform as 'android' | 'ios' | 'web');
  });

  afterEach(() => {
    audioSessionOrchestrator.resetForTests();
    setTestPlatform(initialPlatform as 'android' | 'ios' | 'web');
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each(['default','integrated-recording'] as const)('can retry an initial resource resolution failure with no URI (%s)', async variant => {
    setTestPlatform('android');
    const onRetry=jest.fn();
    const screen=await render(<StudyAudioPlayer label="Missing address" playbackKey="missing" resolving={false} variant={variant} onRetry={onRetry}/>);
    await fireEvent.press(screen.getByLabelText('重试音频'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(mockPlayer.replace).not.toHaveBeenCalled();
  });

  it.each(['ios', 'android'] as const)('waits for the replacement source to load before %s autoplay', async (platform) => {
    setTestPlatform(platform);
    const screen = await render(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence1" playbackKey={`card-${platform}`} uri={`https://example.test/card-${platform}.mp3`} />,
    );

    expect(mockPlayer.replace).toHaveBeenCalledWith(`https://example.test/card-${platform}.mp3`);
    expect(mockPlayer.play).not.toHaveBeenCalled();

    mockStatus = { ...mockStatus, isBuffering: false, isLoaded: true, playbackState: 'readyToPlay' };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence1" playbackKey={`card-${platform}`} uri={`https://example.test/card-${platform}.mp3`} />,
    );

    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));
  });

  it('requires a first Web gesture, then restores navigation autoplay after playback advances', async () => {
    setTestPlatform('web');
    mockStatus = { ...initialMockStatus(), isBuffering: false, isLoaded: true, playbackState: 'readyToPlay' };
    const screen = await render(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence1" playbackKey="web-card-1" uri="https://example.test/web-card-1.mp3" />,
    );

    await act(async () => Promise.resolve());
    expect(mockPlayer.play).not.toHaveBeenCalled();
    expect(screen.getByLabelText('播放')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('播放'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);

    mockStatus = { ...mockStatus, currentTime: 0, playing: true };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence1" playbackKey="web-card-1" uri="https://example.test/web-card-1.mp3" />,
    );
    expect(screen.getByLabelText('音频正在启动').props.accessibilityState).toEqual({ disabled: true });

    mockStatus = { ...mockStatus, currentTime: 0.25 };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence1" playbackKey="web-card-1" uri="https://example.test/web-card-1.mp3" />,
    );

    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={2} label="Sentence2" playbackKey="web-card-2" uri="https://example.test/web-card-2.mp3" />,
    );
    mockStatus = { ...initialMockStatus() };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={2} label="Sentence2" playbackKey="web-card-2" uri="https://example.test/web-card-2.mp3" />,
    );
    mockStatus = { ...initialMockStatus(), isBuffering: false, isLoaded: true, playbackState: 'readyToPlay' };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={2} label="Sentence2" playbackKey="web-card-2" uri="https://example.test/web-card-2.mp3" />,
    );

    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(2));
    mockStatus = { ...mockStatus, currentTime: 0.25, playing: true };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={2} label="Sentence2" playbackKey="web-card-2" uri="https://example.test/web-card-2.mp3" />,
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText('暂停'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await screen.unmount();
  });

  it('issues the first Web play call inside the user gesture without awaiting the audio lease', async () => {
    setTestPlatform('web');
    let finishModeSwitch!: () => void;
    mockSetAudioModeAsync.mockReturnValueOnce(new Promise<void>((resolve) => { finishModeSwitch = resolve; }));
    mockStatus = { ...initialMockStatus(), isBuffering: false, isLoaded: true, playbackState: 'readyToPlay' };
    const screen = await render(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence18" playbackKey="web-ios-gesture" uri="https://example.test/sentence-18.mp3" />,
    );

    fireEvent.press(screen.getByLabelText('播放'));

    expect(mockSetAudioModeAsync).not.toHaveBeenCalled();
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(audioSessionOrchestrator.getActiveLeaseForTests()).toBeUndefined();

    await waitFor(() => expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1));
    await act(async () => {
      finishModeSwitch();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(audioSessionOrchestrator.getActiveLeaseForTests()?.owner).toBe('study'));

    mockStatus = { ...mockStatus, currentTime: 0.25, playing: true };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence18" playbackKey="web-ios-gesture" uri="https://example.test/sentence-18.mp3" />,
    );
    await screen.unmount();
  });

  it('pauses Web playback and exposes retry when the gesture-started lease fails', async () => {
    setTestPlatform('web');
    mockSetAudioModeAsync.mockRejectedValueOnce(new Error('mode failed'));
    mockStatus = { ...initialMockStatus(), isBuffering: false, isLoaded: true, playbackState: 'readyToPlay' };
    const screen = await render(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence18" playbackKey="web-lease-failure" uri="https://example.test/sentence-18.mp3" />,
    );
    mockPlayer.pause.mockClear();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('播放'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('音频启动超时')).toBeTruthy());
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(screen.getByLabelText('重试音频')).toBeTruthy();
    expect(audioSessionOrchestrator.getActiveLeaseForTests()).toBeUndefined();
    await screen.unmount();
  });

  it.each(['ios', 'android'] as const)('shows a native session failure and recovers on another %s play tap', async platform => {
    setTestPlatform(platform);
    mockStatus = { ...initialMockStatus(), isBuffering: false, isLoaded: true, playbackState: 'readyToPlay' };
    const screen = await render(<StudyAudioPlayer label="Sentence584" playbackKey="native-recovery" uri="https://example.test/584.mp3" variant="integrated-recording" />);
    mockSetAudioModeAsync.mockRejectedValueOnce(new Error('mode')).mockRejectedValueOnce(new Error('idle'));
    await act(async () => { fireEvent.press(screen.getByLabelText('播放')); });
    await waitFor(() => expect(screen.getByText('音频暂时无法启动，请再次点击播放重试。')).toBeTruthy());
    expect(mockPlayer.play).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(screen.getByLabelText('播放')); });
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('音频暂时无法启动，请再次点击播放重试。')).toBeNull();
    await screen.unmount();
  });

  it('turns a Web first-frame stall into a recoverable state instead of spinning forever', async () => {
    setTestPlatform('web');
    mockStatus = { ...initialMockStatus(), isBuffering: false, isLoaded: true, playbackState: 'readyToPlay' };
    const screen = await render(
      <StudyAudioPlayer autoPlayRequest={1} label="SIA 852-1" playbackKey="web-stall" uri="https://example.test/web-stall.mp3" />,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('播放'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);

    mockStatus = { ...mockStatus, currentTime: 0, playing: true };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={1} label="SIA 852-1" playbackKey="web-stall" uri="https://example.test/web-stall.mp3" />,
    );

    await waitFor(
      () => expect(screen.getByText('音频启动超时')).toBeTruthy(),
      { timeout: WEB_AUDIO_FIRST_FRAME_TIMEOUT_MS + 1_000 },
    );
    expect(screen.getByText('浏览器未能开始播放；请重新加载后点击播放。')).toBeTruthy();
    expect(mockPlayer.pause).toHaveBeenCalled();
    await waitFor(() => expect(audioSessionOrchestrator.getActiveLeaseForTests()).toBeUndefined());
    await screen.unmount();
  }, 10_000);

  it('reports source readiness once and uses the manifest duration while metadata loads', async () => {
    const onReady = jest.fn();
    mockStatus = { ...mockStatus, duration: 0, isLoaded: false };
    const screen = await render(
      <StudyAudioPlayer
        durationHint={5.112}
        label="Sentence1"
        onReady={onReady}
        playbackKey="card-ready"
        uri="https://example.test/card-ready.mp3"
      />,
    );

    expect(screen.getByText('0:05')).toBeTruthy();
    expect(onReady).not.toHaveBeenCalled();

    mockStatus = { ...mockStatus, duration: 5.112, isBuffering: false, isLoaded: true, playbackState: 'readyToPlay' };
    await screen.rerender(
      <StudyAudioPlayer
        durationHint={5.112}
        label="Sentence1"
        onReady={onReady}
        playbackKey="card-ready"
        uri="https://example.test/card-ready.mp3"
      />,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    mockStatus = { ...mockStatus };
    await screen.rerender(
      <StudyAudioPlayer
        durationHint={5.112}
        label="Sentence1"
        onReady={onReady}
        playbackKey="card-ready"
        uri="https://example.test/card-ready.mp3"
      />,
    );
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('does not mistake the previous card loaded status for the replacement source readiness', async () => {
    mockStatus = { ...mockStatus, isBuffering: false, isLoaded: true, playbackState: 'readyToPlay' };
    const screen = await render(
      <StudyAudioPlayer label="Sentence1" playbackKey="card-1" uri="https://example.test/card-1.mp3" />,
    );

    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={2} label="Sentence2" playbackKey="card-2" uri="https://example.test/card-2.mp3" />,
    );

    expect(mockPlayer.replace).toHaveBeenLastCalledWith('https://example.test/card-2.mp3');
    expect(mockPlayer.play).not.toHaveBeenCalled();

    mockStatus = { ...mockStatus, isBuffering: true, isLoaded: false, playbackState: 'loading' };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={2} label="Sentence2" playbackKey="card-2" uri="https://example.test/card-2.mp3" />,
    );
    expect(mockPlayer.play).not.toHaveBeenCalled();

    mockStatus = { ...mockStatus, isBuffering: false, isLoaded: true, playbackState: 'readyToPlay' };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={2} label="Sentence2" playbackKey="card-2" uri="https://example.test/card-2.mp3" />,
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

  it('drops an acquired autoplay lease when a pause request makes the operation stale', async () => {
    let finishModeSwitch!: () => void;
    mockSetAudioModeAsync.mockReturnValueOnce(new Promise<void>((resolve) => { finishModeSwitch = resolve; }));
    mockStatus = { ...mockStatus, isBuffering: false, isLoaded: true, playbackState: 'readyToPlay', playing: false };
    const screen = await render(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence2" pauseRequest={0} playbackKey="card-stale" uri="https://example.test/card-stale.mp3" />,
    );
    mockStatus = { ...mockStatus };
    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence2" pauseRequest={0} playbackKey="card-stale" uri="https://example.test/card-stale.mp3" />,
    );
    await waitFor(() => expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1));

    await screen.rerender(
      <StudyAudioPlayer autoPlayRequest={1} label="Sentence2" pauseRequest={1} playbackKey="card-stale" uri="https://example.test/card-stale.mp3" />,
    );
    await act(async () => {
      finishModeSwitch();
      await Promise.resolve();
      await Promise.resolve();
    });

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

  it('does not crash cleanup when Fast Refresh already released the native player', async () => {
    mockPlayer.pause.mockImplementation(() => { throw new Error('NativeSharedObjectNotFoundException'); });
    const screen = await render(
      <StudyAudioPlayer label="Sentence4" playbackKey="card-fast-refresh" uri="https://example.test/card-fast-refresh.mp3" />,
    );

    await screen.unmount();

    expect(mockPlayer.pause).toHaveBeenCalled();
  });

  it('seeks to the beginning before replaying naturally completed audio', async () => {
    mockStatus = { ...mockStatus, currentTime: 10, didJustFinish: true, duration: 10, isBuffering: false, isLoaded: true, playbackState: 'readyToPlay', playing: false };
    const onPlaybackStart = jest.fn();
    const screen = await render(
      <StudyAudioPlayer label="Sentence5" onPlaybackStart={onPlaybackStart} playbackKey="card-5" uri="https://example.test/card-5.mp3" />,
    );
    mockStatus = { ...mockStatus, didJustFinish: false };
    await screen.rerender(
      <StudyAudioPlayer label="Sentence5" onPlaybackStart={onPlaybackStart} playbackKey="card-5" uri="https://example.test/card-5.mp3" />,
    );
    mockPlayer.seekTo.mockClear();
    mockPlayer.play.mockClear();

    fireEvent.press(screen.getByLabelText('播放'));

    await waitFor(() => expect(mockPlayer.seekTo).toHaveBeenCalledWith(0));
    await waitFor(() => expect(onPlaybackStart).toHaveBeenCalledTimes(1));
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

  it('renders the recording variant directly on the outer card surface', async () => {
    mockStatus = { ...mockStatus, currentTime: 2, duration: 8, isBuffering: false, isLoaded: true, playbackState: 'readyToPlay', playing: false };
    const screen = await render(
      <StudyAudioPlayer
        label="图片题-002-01"
        playbackKey="image-question-2"
        practiceControls={<View testID="practice-controls" />}
        uri="https://example.test/image-question-2.mp3"
        variant="integrated-recording"
      />,
    );

    expect(StyleSheet.flatten(screen.getByTestId('study-audio-player').props.style)).toMatchObject({
      backgroundColor: 'transparent',
      borderRadius: 0,
      borderWidth: 0,
      padding: 0,
    });
    expect(StyleSheet.flatten(screen.getByText('图片题-002-01').props.style)).toMatchObject({ fontSize: 14, lineHeight: 20 });
    expect(screen.getByTestId('integrated-audio-controls')).toBeTruthy();
    expect(screen.getByTestId('practice-controls')).toBeTruthy();
    expect(screen.getByLabelText('播放速度 1 倍').props.accessibilityState).toEqual({ disabled: false, expanded: false });
  });

  it('keeps recording available while integrated question audio is unavailable', async () => {
    const screen = await render(
      <StudyAudioPlayer
        label="Sentence297"
        playbackKey="missing-audio"
        practiceControls={<View testID="available-recording-controls" />}
        variant="integrated-recording"
      />,
    );

    expect(screen.getByText('音频加载失败')).toBeTruthy();
    expect(screen.getByLabelText('播放').props.accessibilityState).toEqual({ disabled: true });
    expect(screen.getByLabelText('播放速度 1 倍').props.accessibilityState).toEqual({ disabled: true, expanded: false });
    expect(screen.getByTestId('available-recording-controls')).toBeTruthy();
  });
});
