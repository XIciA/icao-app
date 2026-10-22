import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AppText } from '@/components/ui';
import { Copy, Phone } from '@/components/ui/icons';
import { colors, radii, spacing } from '@/theme';

export function ContactRow() {
  const [feedback, setFeedback] = useState('');
  const pending = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(timer.current); };
  }, []);
  async function copy() {
    if (pending.current) return;
    pending.current = true;
    try {
      const copied = await Clipboard.setStringAsync('15739508390');
      if (mounted.current) setFeedback(copied ? '已复制' : '复制失败，请重试');
    } catch {
      if (mounted.current) setFeedback('复制失败，请重试');
    } finally {
      pending.current = false;
      if (mounted.current) {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setFeedback(''), 3000);
      }
    }
  }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="联系我们，复制手机号15739508390" onPress={() => { void copy(); }} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.icon}><Phone color={colors.primary} size={18} /></View>
      <AppText variant="button" style={styles.label}>联系我们</AppText>
      <AppText variant="body" style={styles.number}>157 3950 8390</AppText>
      <Copy color={colors.mutedForeground} size={18} />
    </Pressable>
    {feedback ? <AppText accessibilityLiveRegion="polite" variant="caption" style={styles.feedback}>{feedback}</AppText> : null}
  </>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], minHeight: 60, paddingHorizontal: spacing[4] },
  icon: { alignItems: 'center', justifyContent: 'center', width: 36, height: 36, backgroundColor: colors.primary045, borderRadius: radii.full },
  label: { flexGrow: 1, flexShrink: 1 }, number: { color: colors.mutedForeground, flexShrink: 0 },
  pressed: { backgroundColor: colors.secondary },
  feedback: { paddingHorizontal: spacing[4], paddingBottom: spacing[2], textAlign: 'right' },
});
