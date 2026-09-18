import * as Speech from 'expo-speech';
import { Alert } from 'react-native';

import { speakVocabulary, speakVocabularyWithFeedback, stopVocabularySpeech } from '../speech.native';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => undefined), maxSpeechInputLength: 4000 }));
const speak = jest.mocked(Speech.speak);
const stop = jest.mocked(Speech.stop);
const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
async function flush() { for (let index = 0; index < 12; index += 1) await Promise.resolve(); }
function callbacks(index = 0) { return speak.mock.calls[index][1]!; }

beforeEach(async () => {
  await stopVocabularySpeech();
  jest.clearAllMocks();
  stop.mockResolvedValue(undefined);
});

afterEach(async () => { await stopVocabularySpeech(); });

test('normal word and example complete in order', async () => {
  const result = speakVocabulary('air/ground', 'Report your position.');
  await flush();
  expect(speak).toHaveBeenCalledWith('air or ground', expect.any(Object));
  callbacks().onDone?.(); await flush();
  expect(speak.mock.calls[1][0]).toBe('Report your position.');
  callbacks(1).onDone?.();
  await expect(result).resolves.toBe(true);
});

test('leaving or changing a word cancels immediately without an error or a stale example', async () => {
  const result = speakVocabularyWithFeedback('aircraft', 'The aircraft is ready.');
  await flush();
  const previous = callbacks();
  await stopVocabularySpeech();
  await expect(result).resolves.toBe(false);
  previous.onDone?.(); previous.onError?.(new Error('late error'));
  await flush();
  expect(speak).toHaveBeenCalledTimes(1);
  expect(alert).not.toHaveBeenCalled();
});

test('native interruption is cancellation and does not launch the example', async () => {
  const result = speakVocabularyWithFeedback('aircraft', 'The aircraft is ready.');
  await flush(); callbacks().onStopped?.();
  await expect(result).resolves.toBe(false);
  expect(speak).toHaveBeenCalledTimes(1);
  expect(alert).not.toHaveBeenCalled();
});

test('a real synthesis failure still gives clear feedback', async () => {
  const result = speakVocabularyWithFeedback('aircraft');
  await flush(); callbacks().onError?.(new Error('synthesis failed'));
  await expect(result).resolves.toBe(false);
  expect(alert).toHaveBeenCalledTimes(1);
});

test('rapid requests serialize pending native stops and only play the latest word', async () => {
  let releaseStop!: () => void;
  stop.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseStop = resolve; }));
  const first = speakVocabularyWithFeedback('first'); await flush();
  const second = speakVocabularyWithFeedback('second'); await flush();
  expect(speak).not.toHaveBeenCalled();
  releaseStop(); await flush();
  await expect(first).resolves.toBe(false);
  expect(speak).toHaveBeenCalledTimes(1);
  expect(speak.mock.calls[0][0]).toBe('second');
  callbacks().onDone?.(); await expect(second).resolves.toBe(true);
  expect(alert).not.toHaveBeenCalled();
});
