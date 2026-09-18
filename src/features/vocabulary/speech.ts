import * as Speech from 'expo-speech';
import { Alert } from 'react-native';

const wordProfile = { language: 'en-US', pitch: 0.98, rate: 0.82 } as const;
const sentenceProfile = { language: 'en-US', pitch: 1, rate: 0.91 } as const;
type SpeechResult = 'done' | 'cancelled' | 'failed';
let generation = 0;
let cancelCurrent: (() => void) | undefined;
let stopQueue: Promise<void> = Promise.resolve();

function normalize(text: string) {
  return text.replace(/\//g, ' or ').replace(/[()（）]/g, ' ').replace(/\s+/g, ' ').trim();
}

function profile(text: string) {
  return /[.!?]$/.test(text) || text.split(/\s+/).length > 5 ? sentenceProfile : wordProfile;
}

function stopCurrentSpeech() {
  cancelCurrent?.();
  cancelCurrent = undefined;
  // Serialize native stops so an older request cannot stop a newer utterance.
  stopQueue = stopQueue.then(async () => {
    try { await Speech.stop(); } catch { /* Speech failure must not block learning. */ }
  });
  return stopQueue;
}

function speakOnce(text: string, request: number) {
  const value = normalize(text);
  if (!value) return Promise.resolve<SpeechResult>('failed');
  return new Promise<SpeechResult>((resolve) => {
    let settled = false;
    const cancel = () => finish('cancelled');
    const finish = (result: SpeechResult) => {
      if (settled) return;
      settled = true;
      if (cancelCurrent === cancel) cancelCurrent = undefined;
      resolve(request === generation ? result : 'cancelled');
    };
    cancelCurrent = cancel;
    try {
      Speech.speak(value.slice(0, Speech.maxSpeechInputLength), {
        ...profile(value),
        onDone: () => finish('done'),
        onError: () => finish('failed'),
        onStopped: cancel,
      });
    } catch {
      finish('failed');
    }
  });
}

export async function stopVocabularySpeech() {
  generation += 1;
  await stopCurrentSpeech();
}

async function runVocabularySpeech(word: string, example?: string) {
  const request = ++generation;
  await stopCurrentSpeech();
  let result: SpeechResult = 'cancelled';
  if (request === generation) result = await speakOnce(word, request);
  if (result === 'done' && request === generation && example?.trim()) {
    result = await speakOnce(example, request);
  }
  return { request, result };
}

export async function speakVocabulary(word: string, example?: string) {
  const { request, result } = await runVocabularySpeech(word, example);
  return request === generation && result === 'done';
}

export async function speakVocabularyWithFeedback(word: string, example?: string) {
  const { request, result } = await runVocabularySpeech(word, example);
  if (request === generation && result === 'failed') {
    Alert.alert('暂时无法播放发音', '请检查设备音量或系统语音设置。你仍然可以继续学习。');
  }
  return request === generation && result === 'done';
}
