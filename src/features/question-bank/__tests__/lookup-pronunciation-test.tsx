import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { LookupPronunciation } from '../components/LookupPronunciation';
import { audioSessionOrchestrator } from '@/platform/audio';
import { speakVocabulary, stopVocabularySpeech } from '@/features/vocabulary/speech.native';

jest.mock('@/platform/audio', () => ({ audioSessionOrchestrator: {
  register: jest.fn(() => jest.fn()), acquire: jest.fn(), release: jest.fn(async () => undefined),
} }));
jest.mock('@/features/vocabulary/speech.native', () => ({ speakVocabulary: jest.fn(), stopVocabularySpeech: jest.fn(async () => undefined) }));
jest.mock('lucide-react-native', () => ({ Volume2: () => null }));

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(audioSessionOrchestrator.acquire).mockResolvedValue({ owner: 'wordSpeech', token: 1 });
  jest.mocked(speakVocabulary).mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

it('speaks only on demand using the existing vocabulary voice and releases ownership', async () => {
  const screen = await render(<LookupPronunciation word="runway" />);
  expect(speakVocabulary).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('播放runway发音'));
  expect(audioSessionOrchestrator.acquire).toHaveBeenCalledWith('wordSpeech', 'word-lookup');
  expect(speakVocabulary).toHaveBeenCalledWith('runway');
  expect(audioSessionOrchestrator.release).toHaveBeenCalledWith({ owner: 'wordSpeech', token: 1 });
});

it('does not start speech after a pending acquisition returns to a closed lookup', async () => {
  const pending = deferred<{ owner: 'wordSpeech'; token: number }>();
  jest.mocked(audioSessionOrchestrator.acquire).mockReturnValue(pending.promise);
  const screen = await render(<LookupPronunciation word="runway" />);
  await fireEvent.press(screen.getByLabelText('播放runway发音'));
  await screen.unmount();
  await act(async () => { pending.resolve({ owner: 'wordSpeech', token: 2 }); });
  expect(speakVocabulary).not.toHaveBeenCalled();
  expect(audioSessionOrchestrator.release).toHaveBeenCalledWith({ owner: 'wordSpeech', token: 2 });
});

it('stops on background and treats the interrupted utterance as cancellation', async () => {
  const speech = deferred<boolean>();
  jest.mocked(speakVocabulary).mockReturnValue(speech.promise);
  const spy = jest.spyOn(AppState, 'addEventListener');
  const screen = await render(<LookupPronunciation word="runway" />);
  await fireEvent.press(screen.getByLabelText('播放runway发音'));
  await act(async () => { spy.mock.calls[0][1]('background'); speech.resolve(false); });
  expect(stopVocabularySpeech).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('发音暂不可用，请重试')).toBeNull();
});

it('does not overlap recording when the audio session rejects acquisition', async () => {
  jest.mocked(audioSessionOrchestrator.acquire).mockRejectedValue(new Error('recording_exclusive'));
  const screen = await render(<LookupPronunciation word="runway" />);
  await fireEvent.press(screen.getByLabelText('播放runway发音'));
  expect(speakVocabulary).not.toHaveBeenCalled();
  expect(screen.getByText('发音暂不可用，请重试')).toBeTruthy();
});
