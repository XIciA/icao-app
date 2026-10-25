import { StyleSheet, View } from 'react-native';
import { AppText, Tag } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import type { VocabularyWord } from '../types';
import { vocabularyFrequencyBadge, vocabularyFrequencyLabel } from '../frequency';

export function VocabularyFrequency({ word, compact = false }: { word: VocabularyWord; compact?: boolean }) {
  const label = vocabularyFrequencyLabel(word.frequency);
  if (compact) {
    const badge = vocabularyFrequencyBadge(word.frequency);
    return badge ? <View accessible accessibilityLabel={label} style={styles.badge}><AppText color={colors.primary} maxFontSizeMultiplier={1.4} variant="caption">{badge}</AppText></View> : null;
  }
  return label ? <Tag tone="muted">{label}</Tag> : null;
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', backgroundColor: colors.primary10, borderRadius: radii.sm, paddingHorizontal: spacing[1.5], paddingVertical: 1 },
});
