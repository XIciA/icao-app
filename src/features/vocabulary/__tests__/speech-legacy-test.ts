import * as Speech from 'expo-speech';
import { speakVocabulary } from '../speech';

// Jest's native preset otherwise resolves speech.native.ts. Pin the Vercel adapter.
jest.mock('../speech', () => jest.requireActual('../speech.ts'));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => undefined), maxSpeechInputLength: 4000 }));
const speak = jest.mocked(Speech.speak);
const stop = jest.mocked(Speech.stop);
const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };
beforeEach(() => { jest.clearAllMocks(); stop.mockResolvedValue(undefined); });

test('lookup uses the existing vocabulary word voice', async () => {
  const result = speakVocabulary('aircraft', undefined, new AbortController().signal);
  await flush();
  expect(speak).toHaveBeenCalledWith('aircraft', expect.objectContaining({ language: 'en-US', pitch: 0.98, rate: 0.82 }));
  speak.mock.calls[0][1]?.onDone?.();
  await expect(result).resolves.toBe(true);
});
test('closing lookup while the previous speech is stopping cannot start a late word', async () => {
  let finishStop!: () => void;
  stop.mockImplementationOnce(() => new Promise<void>((resolve) => { finishStop = resolve; }));
  const controller = new AbortController();
  const result = speakVocabulary('aircraft', undefined, controller.signal);
  controller.abort(); finishStop();
  await expect(result).resolves.toBe(false);
  expect(speak).not.toHaveBeenCalled();
});
test('closing lookup stops active speech and ignores late callbacks', async () => {
  const controller = new AbortController();
  const result = speakVocabulary('aircraft', undefined, controller.signal);
  await flush(); controller.abort();
  await expect(result).resolves.toBe(false);
  expect(stop).toHaveBeenCalledTimes(2);
  speak.mock.calls[0][1]?.onDone?.();
});
test('synthesis failure is reported for retry', async () => {
  const result = speakVocabulary('aircraft');
  await flush(); speak.mock.calls[0][1]?.onError?.(new Error('unavailable'));
  await expect(result).resolves.toBe(false);
});
