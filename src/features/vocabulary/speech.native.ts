import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Alert, AppState } from 'react-native';
import { audioSessionOrchestrator, createSessionManagedAudioPlayer, type AudioLease } from '@/platform/audio';
import { resolveRemoteQuestionBankAsset } from '@/features/question-bank/platform/resource-service';

type SpeechResult = 'done' | 'cancelled' | 'failed';
let generation = 0;
let cancelCurrent: (() => void) | undefined;
let registered = false;

export function normalizePronunciation(text: string) {
  return text.replace(/\//g, ' or ').replace(/[()（）]/g, ' ').replace(/\s+/g, ' ').trim();
}

function ensureRegistered() {
  if (registered) return;
  registered = true;
  // One owner for lookup, vocabulary and example playback. Deactivation must
  // not await release inside the orchestrator's transition queue.
  audioSessionOrchestrator.register('wordSpeech', { deactivate: () => { generation += 1; cancelCurrent?.(); } });
  AppState.addEventListener('change', state => { if (state !== 'active') void stopVocabularySpeech(); });
}

export async function stopVocabularySpeech() {
  generation += 1;
  cancelCurrent?.();
}

async function playFile(text: string, request: number, onStart?: () => void): Promise<SpeechResult> {
  const normalized = normalizePronunciation(text);
  if (!normalized) return 'failed';
  const hash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, normalized);
  const uri = await resolveRemoteQuestionBankAsset(`/pronunciation-assets/${hash}.mp3`, { isCurrent: () => request === generation });
  if (request !== generation) return 'cancelled';
  if (!uri) return 'failed';
  let lease: AudioLease | undefined;
  const player = createSessionManagedAudioPlayer(uri, { updateInterval: 100 });
  try {
    lease = await audioSessionOrchestrator.acquire('wordSpeech', 'recorded-pronunciation');
    if (request !== generation) return 'cancelled';
    return await new Promise<SpeechResult>((resolve) => {
      let settled = false;
      let started = false, notified = false;
      let subscription: { remove: () => void } | undefined;
      let timer: ReturnType<typeof setTimeout>;
      const finish = (result: SpeechResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        subscription?.remove();
        if (cancelCurrent === cancel) cancelCurrent = undefined;
        try { player.pause(); } catch { /* A released player is already silent. */ }
        resolve(request === generation ? result : 'cancelled');
      };
      const cancel = () => finish('cancelled');
      cancelCurrent = cancel;
      timer = setTimeout(() => finish('failed'), 20_000);
      const start = () => {
        if (started || settled) return;
        started = true;
        clearTimeout(timer);
        timer = setTimeout(() => finish('failed'), 180_000);
        try { player.play(); } catch { finish('failed'); }
      };
      subscription = player.addListener('playbackStatusUpdate', status => {
        if (request === generation && !settled && status.playing && !notified) { notified = true; onStart?.(); }
        if (status.playbackState === 'error') finish('failed');
        else if (status.didJustFinish) finish('done');
        else if (status.isLoaded) start();
      });
      if (player.isLoaded) start();
    });
  } finally {
    try { player.remove(); } catch { /* Native cleanup may already have completed. */ }
    if (lease) await audioSessionOrchestrator.release(lease).catch(() => undefined);
  }
}

async function runVocabularySpeech(word: string, example?: string, onStart?: () => void) {
  ensureRegistered();
  const request = ++generation;
  cancelCurrent?.();
  let result: SpeechResult = 'cancelled';
  try {
    result = await playFile(word, request, onStart);
    if (result === 'done' && request === generation && example?.trim()) result = await playFile(example, request);
  } catch { result = request === generation ? 'failed' : 'cancelled'; }
  return { request, result };
}
export async function speakVocabulary(word: string, example?: string) {
  const { request, result } = await runVocabularySpeech(word, example);
  return request === generation && result === 'done';
}
export async function speakVocabularyWithFeedback(word: string, example?: string, onStart?: () => void) {
  const { request, result } = await runVocabularySpeech(word, example, onStart);
  if (request === generation && result === 'failed') Alert.alert('暂时无法播放发音', '请检查网络后重试。你仍然可以继续学习。');
  return request === generation && result === 'done';
}
