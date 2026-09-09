import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import * as Speech from 'expo-speech';
import { ExamQuestionAudio } from '../components/ExamQuestionAudio.native';
import type { AudioInterruptionEvent } from '../../../../modules/icao-audio-interruption/src';
const mockPlayer = { pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(async () => undefined), replace: jest.fn(), playbackRate: 1, currentTime: 0 };
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
  expect(screen.queryByRole('button')).toBeNull(); expect(mockPlayer.playbackRate).toBe(1);
});
it('resumes ordinary background interruption at the current position without issuing a fresh replay', async () => {
  const screen = await playing(); mockPlayer.currentTime = 7;
  await act(() => mockAppState?.('inactive')); await act(() => mockAppState?.('active'));
  await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(2));
  expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(7); expect(screen.queryByText('重播本题音频')).toBeNull();
});
it('allows exactly one explicit replay following a real call interruption', async () => {
  const screen = await playing(); mockPlayer.currentTime = 4;
  await act(() => { mockInterruption?.({ phase: 'began', isCall: true }); mockAppState?.('inactive'); });
  await act(() => { mockInterruption?.({ phase: 'ended', isCall: true }); mockAppState?.('active'); });
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByText('重播本题音频'));
  await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(2)); expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(0);
  await act(() => { mockInterruption?.({ phase: 'began', isCall: true }); mockInterruption?.({ phase: 'ended', isCall: true }); });
  expect(screen.queryByText('重播本题音频')).toBeNull();
});
it('does not replay audio when recording starts or when a call begins after recording already stopped the question', async () => {
  const screen = await playing();
  await screen.rerender(<ExamQuestionAudio {...props} pauseRequest={1} />);
  await act(() => { mockInterruption?.({ phase: 'began', isCall: true }); mockInterruption?.({ phase: 'ended', isCall: true }); });
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
