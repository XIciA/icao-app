import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import * as Speech from 'expo-speech';
import { audioSessionOrchestrator } from '@/platform/audio';
import { ExamQuestionAudio } from '../components/ExamQuestionAudio.native';
import type { AudioInterruptionEvent } from '../../../../modules/icao-audio-interruption/src';
// Native playbackRate is getter-only; the method is the supported write API.
const mockPlayer = { pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(async () => undefined), replace: jest.fn(), setPlaybackRate: jest.fn(), get playbackRate() { return 1; }, currentTime: 0 };
let mockStatus = { isLoaded: false, playbackState: 'loading', currentTime: 0, playing: false, didJustFinish: false };
let mockInterruption: ((event: AudioInterruptionEvent) => void) | undefined;
let mockAppState: ((state: AppStateStatus) => void) | undefined;
let mockToken = 0;
jest.mock('expo-audio', () => ({ useAudioPlayerStatus: () => mockStatus }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), pause: jest.fn(async () => undefined), resume: jest.fn(async () => undefined), stop: jest.fn(async () => undefined) }));
jest.mock('@/platform/audio', () => ({ useSessionManagedAudioPlayer: () => mockPlayer, audioSessionOrchestrator: { register: jest.fn(() => () => {}), acquire: jest.fn(async () => ({ owner: 'study', token: ++mockToken })), release: jest.fn(async () => undefined) } }));
jest.mock('../../../../modules/icao-audio-interruption/src', () => ({ observeAudioInterruption: (listener: typeof mockInterruption) => { mockInterruption = listener; return { remove: jest.fn() }; } }));
const props = { uri: 'https://assets.test/fixed-question.m4a', label: '本题', pauseRequest: 0 };
beforeEach(() => {
  jest.clearAllMocks(); mockPlayer.currentTime = 0; mockStatus = { isLoaded: false, playbackState: 'loading', currentTime: 0, playing: false, didJustFinish: false };
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, callback) => { mockAppState = callback; return { remove: jest.fn() }; });
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
});
afterEach(() => jest.restoreAllMocks());
async function playing() {
  const screen = await render(<ExamQuestionAudio {...props} />);
  await act(async () => { mockStatus = { ...mockStatus, isLoaded: true, playbackState: 'readyToPlay' }; await screen.rerender(<ExamQuestionAudio {...props} />); });
  await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));
  return screen;
}
it('autoplays a new question without exposing playback, pause, seek or speed controls', async () => {
  const screen = await playing();
  expect(screen.getByText('音频播放中')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull(); expect(mockPlayer.setPlaybackRate).toHaveBeenCalledWith(1);
});
it('waits for signed-media resolution before replacing the player or starting the playback watchdog', async () => {
  jest.useFakeTimers();
  try {
    const fallback = { ...props, uri: 'https://private.test/unresolved.mp3', resolving: true };
    const screen = await render(<ExamQuestionAudio {...fallback} />);
    await act(async () => { jest.advanceTimersByTime(16_000); });
    expect(mockPlayer.replace).not.toHaveBeenCalled();
    expect(mockPlayer.play).not.toHaveBeenCalled();
    expect(screen.getByText('正在准备音频…')).toBeTruthy();
    expect(screen.queryByText('重新加载音频')).toBeNull();

    const resolved = { ...props, uri: 'https://media.test/signed-question.mp3', resolving: false };
    await screen.rerender(<ExamQuestionAudio {...resolved} />);
    expect(mockPlayer.replace).toHaveBeenCalledTimes(1);
    expect(mockPlayer.replace).toHaveBeenLastCalledWith(resolved.uri);
    await act(async () => {
      mockStatus = { ...mockStatus, isLoaded: true, playbackState: 'readyToPlay' };
      await screen.rerender(<ExamQuestionAudio {...resolved} />);
    });
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));
    expect(screen.getByText('音频播放中')).toBeTruthy();
    await screen.unmount();
  } finally { jest.useRealTimers(); }
});
it('resumes ordinary background interruption at the current position without issuing a fresh replay', async () => {
  const screen = await playing(); mockPlayer.currentTime = 7;
  await act(() => mockAppState?.('inactive')); await act(() => mockAppState?.('active'));
  await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(2));
  expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(7); expect(screen.queryByText('重播本题音频')).toBeNull();
});
it('allows explicit replay after each actual audio interruption without a call-specific allowance', async () => {
  const screen = await playing(); mockPlayer.currentTime = 4;
  await act(() => { mockInterruption?.({ phase: 'began' }); mockAppState?.('inactive'); });
  await act(() => { mockInterruption?.({ phase: 'ended' }); mockAppState?.('active'); });
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByText('重播本题音频'));
  await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(2)); expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(0);
  await act(() => { mockInterruption?.({ phase: 'began' }); mockInterruption?.({ phase: 'ended' }); });
  expect(screen.getByText('重播本题音频')).toBeTruthy();
  await fireEvent.press(screen.getByText('重播本题音频'));
  await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(3));
});
it('does not replay audio when recording starts or when an interruption begins after recording already stopped the question', async () => {
  const screen = await playing();
  await screen.rerender(<ExamQuestionAudio {...props} pauseRequest={1} />);
  await act(() => { mockInterruption?.({ phase: 'began' }); mockInterruption?.({ phase: 'ended' }); });
  expect(mockPlayer.play).toHaveBeenCalledTimes(1); expect(screen.queryByText('重播本题音频')).toBeNull();
});
it('uses existing system speech for an OPI question and never autoplays speech in readonly history', async () => {
  const screen = await render(<ExamQuestionAudio text="What makes a good pilot?" label="OPI" pauseRequest={0} />);
  await waitFor(() => expect(Speech.speak).toHaveBeenCalledWith('What makes a good pilot?', expect.objectContaining({ language: 'en-US', useApplicationAudioSession: true })));
  await screen.unmount(); jest.mocked(Speech.speak).mockClear();
  const history = await render(<ExamQuestionAudio exam={false} autoPlay={false} text="What makes a good pilot?" label="OPI" pauseRequest={0} />);
  expect(Speech.speak).not.toHaveBeenCalled();
  await fireEvent.press(history.getByText('播放题目'));
  await waitFor(() => expect(Speech.speak).toHaveBeenCalledTimes(1));
});

it('does not resume on a late interruption end after recording', async () => {
  const screen = await playing();
  await act(() => mockInterruption?.({ phase: 'began' }));
  expect(screen.queryByText('重播本题音频')).toBeNull();
  await screen.rerender(<ExamQuestionAudio {...props} pauseRequest={1} />);
  await act(() => mockInterruption?.({ phase: 'ended' }));
  expect(screen.queryByText('重播本题音频')).toBeNull();
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});

it('never unlocks replay when an interruption happens after the question finished', async () => {
  const screen = await playing();
  await act(async () => {
    mockStatus = { ...mockStatus, didJustFinish: true, playing: false, currentTime: 10 };
    await screen.rerender(<ExamQuestionAudio {...props} />);
  });
  expect(screen.getByText('音频已播放')).toBeTruthy();
  await act(() => { mockInterruption?.({ phase: 'began' }); mockInterruption?.({ phase: 'ended' }); });
  expect(screen.queryByText('重播本题音频')).toBeNull();
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});

it.each(['resolve', 'reject'] as const)('a superseded playback continuation (%s) releases only its own lease and retains the newer owner', async (settlement) => {
  let finishFirstStop!: () => void;
  jest.mocked(Speech.stop).mockImplementationOnce(() => new Promise<void>((resolve, reject) => { finishFirstStop = () => settlement === 'resolve' ? resolve() : reject(new Error('old stop failed')); }));
  const practice = { ...props, exam: false, autoPlay: false };
  const screen = await render(<ExamQuestionAudio {...practice} />);
  await fireEvent.press(screen.getByText('播放题目'));
  await waitFor(() => expect(Speech.stop).toHaveBeenCalledTimes(1));
  const first = await jest.mocked(audioSessionOrchestrator.acquire).mock.results[0]!.value;

  await fireEvent.press(screen.getByText('播放题目'));
  await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));
  const second = await jest.mocked(audioSessionOrchestrator.acquire).mock.results[1]!.value;
  expect(second.token).not.toBe(first.token);
  await act(async () => { finishFirstStop(); });
  expect(audioSessionOrchestrator.release).toHaveBeenCalledWith(first);
  expect(audioSessionOrchestrator.release).not.toHaveBeenCalledWith(second);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);

  // The newer ref must still be retained so a real pause releases it.
  await screen.rerender(<ExamQuestionAudio {...practice} pauseRequest={1} />);
  expect(audioSessionOrchestrator.release).toHaveBeenCalledWith(second);
});
