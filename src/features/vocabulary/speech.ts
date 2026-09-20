import * as Speech from 'expo-speech';
import { Alert } from 'react-native';

const wordProfile = { language: 'en-US', pitch: 0.98, rate: 0.82 } as const;
const sentenceProfile = { language: 'en-US', pitch: 1, rate: 0.91 } as const;

function normalize(text: string) {
  return text.replace(/\//g, ' or ').replace(/[()（）]/g, ' ').replace(/\s+/g, ' ').trim();
}

function profile(text: string) {
  return /[.!?]$/.test(text) || text.split(/\s+/).length > 5 ? sentenceProfile : wordProfile;
}

function speakOnce(text: string, signal?: AbortSignal) {
  const value = normalize(text);
  if (!value || signal?.aborted) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', cancel);
      resolve(result);
    };
    const cancel = () => { void stopVocabularySpeech(); finish(false); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      Speech.speak(value.slice(0, Speech.maxSpeechInputLength), {
        ...profile(value),
        onDone: () => finish(true),
        onError: () => finish(false),
        onStopped: () => finish(false),
      });
    } catch {
      finish(false);
    }
  });
}

export async function stopVocabularySpeech() {
  try { await Speech.stop(); } catch { /* Speech failure must not block learning. */ }
}

export async function speakVocabulary(word: string, example?: string, signal?: AbortSignal) {
  await stopVocabularySpeech();
  const wordPlayed = await speakOnce(word, signal);
  if (!wordPlayed) return false;
  if (example?.trim()) return speakOnce(example, signal);
  return true;
}

export async function speakVocabularyWithFeedback(word: string, example?: string) {
  const played = await speakVocabulary(word, example);
  if (!played) Alert.alert('暂时无法播放发音', '请检查设备音量或系统语音设置。你仍然可以继续学习。');
  return played;
}
