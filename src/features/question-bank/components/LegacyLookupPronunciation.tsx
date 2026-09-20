import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { Volume2 } from '@/components/ui/icons';
import { AppText } from '@/components/ui';
import { speakVocabulary } from '@/features/vocabulary/speech';
import { colors } from '@/theme';

/** Vercel lookup uses the same voice as its vocabulary learning screen. */
export function LegacyLookupPronunciation({ word }: { word: string }) {
  const [phase, setPhase] = useState<'idle' | 'playing' | 'error'>('idle');
  const request = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    const stop = () => {
      request.current?.abort();
      request.current = undefined;
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { stop(); setPhase('idle'); }
    });
    return () => { subscription.remove(); stop(); };
  }, []);

  async function play() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPhase('playing');
    try {
      const played = await speakVocabulary(word, undefined, controller.signal);
      if (!controller.signal.aborted) setPhase(played ? 'idle' : 'error');
    } catch {
      if (!controller.signal.aborted) setPhase('error');
    } finally {
      if (request.current === controller) request.current = undefined;
    }
  }

  return <View style={styles.root}>
    <Pressable accessibilityLabel={`播放${word}发音`} accessibilityRole="button"
      accessibilityState={{ busy: phase === 'playing', disabled: phase === 'playing' }}
      disabled={phase === 'playing'} onPress={() => { void play(); }}
      style={({ pressed }) => [styles.button, pressed || phase === 'playing' ? styles.active : null]}>
      <Volume2 color={colors.primary} size={22} />
    </Pressable>
    {phase === 'error' ? <AppText accessibilityLiveRegion="polite" variant="caption" color={colors.destructive}>发音暂不可用，请重试</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({ root: { alignItems: 'center', flexShrink: 1 }, button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, active: { opacity: 0.55 } });
