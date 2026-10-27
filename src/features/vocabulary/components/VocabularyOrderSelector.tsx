import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import type { VocabularyStudyOrder } from '../study-order';

export function VocabularyOrderSelector({ value, onChange }: { value: VocabularyStudyOrder; onChange: (order: VocabularyStudyOrder) => void }) {
  return <View style={styles.group}>
    {([['frequency', '按频率'], ['random', '乱序学习']] as const).map(([order, label]) => <Pressable
      accessibilityRole="radio" accessibilityState={{ selected: value === order }} accessibilityLabel={label}
      key={order} onPress={() => onChange(order)} style={[styles.option, value === order && styles.selected]}>
      <AppText color={value === order ? colors.primary : colors.mutedForeground} variant="button">{label}</AppText>
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  group: { backgroundColor: colors.muted, borderRadius: radii.md, flexDirection: 'row', padding: spacing[1], gap: spacing[1] },
  option: { alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 44, paddingHorizontal: spacing[2], borderRadius: radii.sm },
  selected: { backgroundColor: colors.card },
});
