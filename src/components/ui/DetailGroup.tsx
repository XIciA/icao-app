import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from './icons';
import { AppText } from './AppText';
import { colors, radii, spacing } from '@/theme';

export function DetailGroup({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.group}><AppText variant="caption">{title}</AppText><View style={styles.surface}>{children}</View></View>;
}
export function DetailRow({ label, children, onPress, disabled, last = false }: { label: string; children?: ReactNode; onPress?: () => void; disabled?: boolean; last?: boolean }) {
  const content = <><AppText color={colors.mutedForeground}>{label}</AppText><View style={styles.value}>{typeof children === 'string' ? <AppText style={styles.valueText}>{children}</AppText> : children}</View>{onPress ? <ChevronRight size={16} color={colors.mutedForeground} /> : null}</>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.row, !last && styles.border]}>{content}</Pressable> : <View style={[styles.row, !last && styles.border]}>{content}</View>;
}
const styles = StyleSheet.create({
  group: { gap: spacing[2] }, surface: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radii.xl, paddingHorizontal: spacing[4] },
  row: { minHeight: 56, paddingVertical: spacing[3], flexDirection: 'row', alignItems: 'center', gap: spacing[3] }, border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  value: { flex: 1, alignItems: 'flex-end', minWidth: 0 }, valueText: { textAlign: 'right' },
});
