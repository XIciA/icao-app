import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native/pure';
import { AppState } from 'react-native';

import {
  StudyAudioPlayer,
  WEB_AUDIO_FIRST_FRAME_TIMEOUT_MS,
} from '../components/StudyAudioPlayer.web';

const mockAcquire = jest.fn();
const mockRelease = jest.fn();
const mockRegister = jest.fn();
const mockEmitAudioDiagnostic = jest.fn();

jest.mock('@/platform/audio', () => ({
  audioSessionOrchestrator: {
    acquire: (...args: unknown[]) => mockAcquire(...args),
    register: (...args: unknown[]) => mockRegister(...args),
    release: (...args: unknown[]) => mockRelease(...args),
  },
  emitAudioDiagnostic: (...args: unknown[]) => mockEmitAudioDiagnostic(...args),
}));

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

type MediaListener = (event: Event) => void;

class MockAudio {
  static instances: MockAudio[] = [];

  readonly listeners = new Map<string, Set<MediaListener>>();
  crossOrigin: string | null = null;
  currentTime = 0;
  duration = Number.NaN;
  ended = false;
  error: { code: number } | null = null;
  paused = true;
  playbackRate = 1;
  preload = '';
  src = '';
  nextPlayResult = () => Promise.resolve();
  load = jest.fn();
  pause = jest.fn(() => {
    this.paused = true;
  });
  play = jest.fn(() => {
    this.paused = false;
    return this.nextPlayResult();
  });
  removeAttribute = jest.fn((name: string) => {
    if (name === 'src') this.src = '';
  });

  constructor() {
    MockAudio.instances.push(this);
  }

  get currentSrc() {
    return this.src;
  }

  addEventListener(type: string, listener: MediaListener) {
    const listeners = this.listeners.get(type) ?? new Set<MediaListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: MediaListener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string) {
    const event = new Event(type);
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

function currentAudio() {
  const audio = MockAudio.instances.at(-1);
  if (!audio) throw new Error('Expected the Web player to create an Audio element.');
  return audio;
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('StudyAudioPlayer.web', () => {
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  let leaseToken = 0;

  beforeAll(() => {
    Object.defineProperty(globalThis, 'Audio', {
      configurable: true,
      value: MockAudio,
    });
  });

  afterAll(() => {
    if (originalAudio) Object.defineProperty(globalThis, 'Audio', originalAudio);
    else Reflect.deleteProperty(globalThis, 'Audio');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    MockAudio.instances = [];
    leaseToken = 0;
    mockAcquire.mockImplementation(async () => ({ owner: 'study', token: ++leaseToken }));
    mockRelease.mockResolvedValue(undefined);
    mockRegister.mockReturnValue(jest.fn());
  });

  afterEach(async () => {
    await cleanup();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('keeps playback clickable before loadeddata or metadata arrives', async () => {
    const screen = await render(
      <StudyAudioPlayer
        label="Sentence18"
        playbackKey="sentence-18"
        uri="https://audio.example.test/018.mp3"
      />,
    );

    const playButton = screen.getByLabelText('播放');
    expect(playButton.props.accessibilityState?.disabled).not.toBe(true);
    await fireEvent.press(playButton);
    expect(currentAudio().play).toHaveBeenCalledTimes(1);
    await act(async () => currentAudio().emit('playing'));
    await flushPromises();
  });

  it('calls native play synchronously before the study lease promise settles', async () => {
    let resolveLease!: (lease: { owner: string; token: number }) => void;
    mockAcquire.mockReturnValueOnce(new Promise((resolve) => {
      resolveLease = resolve;
    }));
    const screen = await render(
      <StudyAudioPlayer
        label="Sentence18"
        playbackKey="sentence-18"
        uri="https://audio.example.test/018.mp3"
      />,
    );

    await fireEvent.press(screen.getByLabelText('播放'));

    expect(mockAcquire).toHaveBeenCalledWith('study', 'study-play');
    expect(currentAudio().play).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveLease({ owner: 'study', token: 1 });
      currentAudio().emit('playing');
      await Promise.resolve();
    });
  });

  it('publishes first-frame readiness once and releases the lease on pause', async () => {
    const onReady = jest.fn();
    const screen = await render(
      <StudyAudioPlayer
        label="Sentence68"
        onReady={onReady}
        playbackKey="sentence-68"
        uri="https://audio.example.test/068.mp3"
      />,
    );
    const audio = currentAudio();

    await fireEvent.press(screen.getByLabelText('播放'));
    await flushPromises();
    await act(async () => audio.emit('playing'));
    await act(async () => audio.emit('playing'));

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('暂停')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('暂停'));
    await waitFor(() => expect(mockRelease).toHaveBeenCalled());
    expect(audio.pause).toHaveBeenCalled();
  });

  it('returns NotAllowedError to a retryable play button without a network error', async () => {
    const screen = await render(
      <StudyAudioPlayer
        label="Sentence18"
        playbackKey="sentence-18"
        uri="https://audio.example.test/018.mp3"
      />,
    );
    currentAudio().nextPlayResult = () => Promise.reject(
      new DOMException('User activation required', 'NotAllowedError'),
    );

    await fireEvent.press(screen.getByLabelText('播放'));
    await flushPromises();

    expect(screen.getByLabelText('播放')).toBeTruthy();
    expect(screen.queryByText('音频网络错误')).toBeNull();
    expect(mockRelease).toHaveBeenCalled();
  });

  it.each([
    [2, '音频网络错误'],
    [3, '音频解码失败'],
    [4, '音频格式不支持'],
  ])('maps media error code %s to a distinct retryable failure', async (code, title) => {
    const screen = await render(
      <StudyAudioPlayer
        label="Sentence18"
        playbackKey="sentence-18"
        uri="https://audio.example.test/018.mp3"
      />,
    );
    const audio = currentAudio();
    audio.error = { code };

    await act(async () => audio.emit('error'));

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByLabelText('重试音频')).toBeTruthy();
  });

  it('times out only after a user starts playback and retries the immutable URI', async () => {
    jest.useFakeTimers();
    const onRetry = jest.fn();
    const uri = 'https://audio.example.test/018.mp3';
    const screen = await render(
      <StudyAudioPlayer
        label="Sentence18"
        onRetry={onRetry}
        playbackKey="sentence-18"
        uri={uri}
      />,
    );
    const audio = currentAudio();

    expect(screen.queryByText('音频启动超时')).toBeNull();
    await fireEvent.press(screen.getByLabelText('播放'));
    await act(async () => {
      jest.advanceTimersByTime(WEB_AUDIO_FIRST_FRAME_TIMEOUT_MS - 1);
      await Promise.resolve();
    });
    expect(screen.queryByText('音频启动超时')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(screen.getByText('音频启动超时')).toBeTruthy();
    const loadCallsBeforeRetry = audio.load.mock.calls.length;
    await fireEvent.press(screen.getByLabelText('重试音频'));
    expect(audio.src).toBe(uri);
    expect(audio.load).toHaveBeenCalledTimes(loadCallsBeforeRetry + 1);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('播放')).toBeTruthy();
  });

  it('keeps one Audio element and ignores events captured for an old question generation', async () => {
    const onReady = jest.fn();
    const screen = await render(
      <StudyAudioPlayer
        label="Sentence18"
        onReady={onReady}
        playbackKey="sentence-18"
        uri="https://audio.example.test/018.mp3"
      />,
    );
    const audio = currentAudio();
    const oldPlaying = Array.from(audio.listeners.get('playing') ?? [])[0];

    await screen.rerender(
      <StudyAudioPlayer
        label="Sentence68"
        onReady={onReady}
        playbackKey="sentence-68"
        uri="https://audio.example.test/068.mp3"
      />,
    );
    await act(async () => oldPlaying?.(new Event('playing')));

    expect(MockAudio.instances).toHaveLength(1);
    expect(onReady).not.toHaveBeenCalled();
    expect(screen.getByLabelText('播放')).toBeTruthy();
  });

  it('applies metadata, seeking, playback rate, and natural completion to the same element', async () => {
    const screen = await render(
      <StudyAudioPlayer
        durationHint={12.648}
        label="Sentence68"
        playbackKey="sentence-68"
        uri="https://audio.example.test/068.mp3"
      />,
    );
    const audio = currentAudio();
    audio.duration = 12.648;
    await act(async () => audio.emit('loadedmetadata'));

    await fireEvent.press(screen.getByLabelText('播放速度 1 倍'));
    await fireEvent.press(screen.getByLabelText('1.25 倍'));
    expect(audio.playbackRate).toBe(1.25);

    await fireEvent(
      screen.getByTestId('question-audio-timeline'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } },
    );
    expect(audio.currentTime).toBe(1);

    await fireEvent.press(screen.getByLabelText('播放'));
    await flushPromises();
    await act(async () => audio.emit('playing'));
    audio.currentTime = audio.duration;
    audio.ended = true;
    await act(async () => audio.emit('ended'));
    expect(screen.getByLabelText('播放')).toBeTruthy();
    expect(mockRelease).toHaveBeenCalled();
  });

  it('falls back quietly when subsequent best-effort autoplay is rejected', async () => {
    jest.useFakeTimers();
    const screen = await render(
      <StudyAudioPlayer
        label="Sentence18"
        playbackKey="sentence-18"
        uri="https://audio.example.test/018.mp3"
      />,
    );
    const audio = currentAudio();
    await fireEvent.press(screen.getByLabelText('播放'));
    await flushPromises();
    await act(async () => audio.emit('playing'));

    audio.nextPlayResult = () => Promise.reject(
      new DOMException('User activation required', 'NotAllowedError'),
    );
    await screen.rerender(
      <StudyAudioPlayer
        autoPlayRequest={2}
        label="Sentence68"
        playbackKey="sentence-68"
        uri="https://audio.example.test/068.mp3"
      />,
    );
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('播放')).toBeTruthy();
    expect(screen.queryByText('音频网络错误')).toBeNull();
  });

  it('pauses for App backgrounding, recording takeover, pause requests, and unmount', async () => {
    let appStateListener: ((state: 'active' | 'background' | 'inactive') => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    let studyClient: { deactivate: () => Promise<void> } | undefined;
    mockRegister.mockImplementation((_owner, client) => {
      studyClient = client;
      return jest.fn();
    });
    const screen = await render(
      <StudyAudioPlayer
        label="Sentence18"
        pauseRequest={0}
        playbackKey="sentence-18"
        uri="https://audio.example.test/018.mp3"
      />,
    );
    const audio = currentAudio();
    await fireEvent.press(screen.getByLabelText('播放'));
    await flushPromises();
    await act(async () => audio.emit('playing'));

    await act(async () => appStateListener?.('background'));
    await flushPromises();
    expect(mockRelease).toHaveBeenCalled();

    await act(async () => appStateListener?.('active'));
    await fireEvent.press(screen.getByLabelText('播放'));
    await flushPromises();
    await act(async () => audio.emit('playing'));
    await act(async () => studyClient?.deactivate());
    expect(audio.pause).toHaveBeenCalled();

    await screen.rerender(
      <StudyAudioPlayer
        label="Sentence18"
        pauseRequest={1}
        playbackKey="sentence-18"
        uri="https://audio.example.test/018.mp3"
      />,
    );
    await screen.unmount();

    expect(audio.pause.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
