import { StyleSheet, View } from 'react-native';

import { colors, radii } from '@/theme';

export function VocabularyProgress({ value }: { value: number }) {
  const percent = `${Math.max(0, Math.min(1, value)) * 100}%` as `${number}%`;
  return (
    <View accessibilityLabel={`进度 ${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`} style={styles.track}>
      <View style={[styles.fill, { width: percent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.secondary, borderRadius: radii.full, height: 7, overflow: 'hidden' },
  fill: { backgroundColor: colors.primary, borderRadius: radii.full, height: '100%' },
});
