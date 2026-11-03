import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, Star } from '@/components/ui/icons';
import { AppText } from '@/components/ui';
import { CollectionRow } from '@/components/learning/CollectionList.native';
import { LookupPronunciation } from '@/features/question-bank/components/LookupPronunciation';
import { colors, spacing } from '@/theme';

type Props = {
  word: string; ipa?: string; meaning?: string; favorite: boolean; saving?: boolean; last?: boolean;
  onFavoriteChange(value: boolean): void;
  children?: ReactNode;
  details?: ReactNode;
  expanded?: boolean;
  onToggleDetails?(): void;
};

/** Same word, pronunciation and favorite action in session lookup and saved vocabulary. */
export function WordCollectionRow({ word, ipa, meaning, favorite, saving, last, onFavoriteChange, children, details, expanded, onToggleDetails }: Props) {
  return <CollectionRow last={last}>
    <View style={styles.heading}>
      <View style={styles.wordAndSound}><AppText variant="cardTitle" style={styles.word}>{word}</AppText><LookupPronunciation word={word} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${favorite ? '取消收藏' : '收藏'} ${word}`} accessibilityState={{ selected: favorite, disabled: saving }}
        disabled={saving} style={styles.favorite} onPress={() => onFavoriteChange(!favorite)}>
        <Star size={20} color={favorite ? colors.accent : colors.mutedForeground} fill={favorite ? colors.accent : 'transparent'} />
      </Pressable>
    </View>
    {ipa ? <AppText variant="caption" color={colors.mutedForeground}>{ipa}</AppText> : null}
    <AppText color={colors.mutedForeground}>{meaning || '暂无释义'}</AppText>
    {children}
    {details && onToggleDetails ? <>
      <Pressable accessibilityRole="button" accessibilityLabel={`查看 ${word} 释义`} accessibilityState={{ expanded }} onPress={onToggleDetails} style={styles.detailsAction}>
        <AppText variant="caption" color={colors.mutedForeground}>{expanded ? '收起释义' : '更多释义'}</AppText><ChevronDown size={14} color={colors.mutedForeground} style={expanded ? styles.rotated : undefined} />
      </Pressable>
      {expanded ? <View style={styles.details}>{details}</View> : null}
    </> : null}
  </CollectionRow>;
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  wordAndSound: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', flex: 1, minWidth: 0 }, word: { flexShrink: 1 },
  favorite: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  detailsAction: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing[1], minHeight: 44 },
  details: { gap: spacing[2] }, rotated: { transform: [{ rotate: '180deg' }] },
});
