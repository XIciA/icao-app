import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Volume2 } from '@/components/ui/icons';
import { AppText } from '@/components/ui';
import { speakVocabulary, stopVocabularySpeech } from '@/features/vocabulary/speech.native';
import { colors } from '@/theme';

/** The shared pronunciation player owns audio across all word surfaces. */
export function LookupPronunciation({ word }: { word: string }) {
  const [phase, setPhase] = useState<'idle' | 'playing' | 'error'>('idle');
  const generation = useRef(0);
  const mounted = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; void stopVocabularySpeech(); };
  }, [word]);
  async function play() {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    setPhase('playing');
    try {
      const played = await speakVocabulary(word);
      if (mounted.current && request === generation.current) setPhase(played ? 'idle' : 'error');
    } finally { busy.current = false; }
  }

  return <View style={styles.root}>
    <Pressable accessibilityLabel={`播放${word}发音`} accessibilityRole="button" accessibilityState={{ busy: phase === 'playing', disabled: phase === 'playing' }} disabled={phase === 'playing'} onPress={() => { void play(); }} style={({ pressed }) => [styles.button, pressed || phase === 'playing' ? styles.active : null]}>
      <Volume2 color={colors.primary} size={22} />
    </Pressable>
    {phase === 'error' ? <AppText accessibilityLiveRegion="polite" variant="caption" color={colors.destructive}>发音暂不可用，请重试</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({ root: { alignItems: 'center', flexShrink: 1 }, button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, active: { opacity: 0.55 } });
