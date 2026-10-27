import { Pressable, StyleSheet, View } from 'react-native';

import { BookOpen, Check, ChevronRight } from '@/components/ui/icons';
import { AppText, Card } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import { vocabularyBookDescription } from '../book-description';
import type { VocabularyBook, VocabularyBookStats } from '../types';
import { VocabularyProgress } from './VocabularyProgress';

export function VocabularyBookCard({ book, stats, selected, onToggle, onDetail }: {
  book: VocabularyBook;
  stats: VocabularyBookStats;
  selected: boolean;
  onToggle: () => void;
  onDetail: () => void;
}) {
  return (
    <Pressable accessibilityLabel={`${selected ? '取消选择' : '选择'}${book.name}`} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onToggle}>
      <Card style={[styles.card, selected ? styles.selected : null]}>
        <View style={styles.body}>
          <View style={styles.heading}>
            <View style={styles.bookIcon}><BookOpen color={colors.primary} size={18} /></View>
            <AppText style={styles.title} variant="cardTitle">{book.name}</AppText>
          </View>
          <AppText style={styles.description}>{vocabularyBookDescription(book)}</AppText>
          <View style={styles.meta}>
            <AppText variant="caption">{book.words.length} 词</AppText>
            <AppText variant="caption">已学 {stats.learned} / {stats.total}</AppText>
          </View>
          <VocabularyProgress value={stats.total ? stats.learned / stats.total : 0} />
        </View>
        <View style={styles.tools}>
          <View style={[styles.check, selected ? styles.checked : null]}>{selected ? <Check color={colors.primaryForeground} size={12} /> : null}</View>
          <Pressable accessibilityLabel={`查看${book.name}详情`} accessibilityRole="button" onPress={(event) => { event.stopPropagation(); onDetail(); }} style={styles.detail}>
            <ChevronRight color={colors.mutedForeground} size={18} />
          </Pressable>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: spacing[1], padding: spacing[4], borderRadius: radii.xl },
  selected: { borderColor: colors.primary },
  body: { flex: 1, minWidth: 0, gap: spacing[1] },
  heading: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  bookIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary10, borderRadius: radii.sm, width: 32, height: 32 },
  title: { flex: 1 },
  description: { color: colors.mutedForeground, fontSize: 13, lineHeight: 22, marginTop: spacing[1] },
  meta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing[1], marginTop: spacing[1] },
  tools: { alignItems: 'center', justifyContent: 'space-between', width: 32, paddingTop: spacing[1] },
  check: { alignItems: 'center', justifyContent: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: radii.full, width: 20, height: 20 },
  checked: { backgroundColor: colors.primary, borderColor: colors.primary },
  detail: { alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 },
});
