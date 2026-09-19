import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { Volume2 } from '@/components/ui/icons';
import { AppText } from '@/components/ui';
import { audioSessionOrchestrator, type AudioLease } from '@/platform/audio';
import { speakVocabulary, stopVocabularySpeech } from '@/features/vocabulary/speech.native';
import { colors } from '@/theme';

/** Uses the existing vocabulary voice, with the same exclusive audio owner as
 * study/recording transports. Mounted only while the lookup is visible. */
export function LookupPronunciation({ word }: { word: string }) {
  const [phase, setPhase] = useState<'idle' | 'playing' | 'error'>('idle');
  const generation = useRef(0);
  const lease = useRef<AudioLease | undefined>(undefined);
  const speaking = useRef(false);
  const mounted = useRef(true);
  const operation = useRef<Promise<void> | undefined>(undefined);
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const stop = async () => {
      generation.current += 1;
      if (speaking.current) {
        speaking.current = false;
        await stopVocabularySpeech();
      }
      if (mounted.current) setPhase('idle');
    };
    const unregister = audioSessionOrchestrator.register('wordSpeech', { deactivate: stop });
    const stopAndRelease = async () => {
      const current = lease.current;
      lease.current = undefined;
      await stop();
      if (current) await audioSessionOrchestrator.release(current).catch(() => undefined);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void stopAndRelease();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      // Keep the owner registered until an in-flight acquire/stop has settled.
      // Otherwise a new player can encounter an active but unregistered owner.
      void Promise.allSettled([stopAndRelease(), operation.current]).then(unregister);
    };
  }, []);

  async function play() {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    setPhase('playing');
    let acquired: AudioLease | undefined;
    try {
      acquired = await audioSessionOrchestrator.acquire('wordSpeech', 'word-lookup');
      if (!mounted.current || request !== generation.current) return;
      lease.current = acquired;
      speaking.current = true;
      const played = await speakVocabulary(word);
      if (mounted.current && request === generation.current) setPhase(played ? 'idle' : 'error');
    } catch {
      if (mounted.current && request === generation.current) setPhase('error');
    } finally {
      busy.current = false;
      if (request === generation.current) speaking.current = false;
      if (lease.current === acquired) lease.current = undefined;
      if (acquired) await audioSessionOrchestrator.release(acquired).catch(() => undefined);
    }
  }

  return <View style={styles.root}>
    <Pressable accessibilityLabel={`播放${word}发音`} accessibilityRole="button" accessibilityState={{ busy: phase === 'playing', disabled: phase === 'playing' }} disabled={phase === 'playing'} onPress={() => { operation.current = play(); }} style={({ pressed }) => [styles.button, pressed || phase === 'playing' ? styles.active : null]}>
      <Volume2 color={colors.primary} size={22} />
    </Pressable>
    {phase === 'error' ? <AppText accessibilityLiveRegion="polite" variant="caption" color={colors.destructive}>发音暂不可用，请重试</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({ root: { alignItems: 'center', flexShrink: 1 }, button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, active: { opacity: 0.55 } });
