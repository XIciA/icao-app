import { Bookmark, Highlighter, Search } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import type { CardLearningState } from '../types';

const tags = [
  { id: 'good' as const, label: '好题', color: '#45A26B' },
  { id: 'memory' as const, label: '记忆', color: '#D6A72D' },
  { id: 'confused' as const, label: '不懂', color: '#D94A53' },
];
const highlights = [
  { id: 'green' as const, label: '重点', color: '#64B77B' },
  { id: 'yellow' as const, label: '记忆', color: '#E2B947' },
  { id: 'red' as const, label: '难点', color: '#DF6870' },
];

export function AnnotationToolbar({
  activeColor,
  dictionaryMode,
  highlightMode,
  onColorChange,
  onDictionaryModeChange,
  onHighlightModeChange,
  onTagsChange,
  selectedTags,
}: {
  activeColor: 'green' | 'yellow' | 'red';
  dictionaryMode: boolean;
  highlightMode: boolean;
  onColorChange: (value: 'green' | 'yellow' | 'red') => void;
  onDictionaryModeChange: (value: boolean) => void;
  onHighlightModeChange: (value: boolean) => void;
  onTagsChange: (value: NonNullable<CardLearningState['tagIds']>) => void;
  selectedTags: NonNullable<CardLearningState['tagIds']>;
}) {
  return (
    <View style={styles.root}>
      <Pressable accessibilityLabel={dictionaryMode ? '关闭查词模式' : '开启查词模式'} onPress={() => onDictionaryModeChange(!dictionaryMode)} style={[styles.highlightToggle, dictionaryMode ? styles.highlightActive : null]}>
        <Search color={dictionaryMode ? colors.primary : colors.mutedForeground} size={15} />
        <AppText color={dictionaryMode ? colors.primary : colors.mutedForeground} variant="caption">点词查词</AppText>
      </Pressable>
      <View style={styles.section}>
        <View style={styles.labelRow}><Bookmark color={colors.mutedForeground} size={15} /><AppText variant="caption">题目标签</AppText></View>
        <View style={styles.options}>
          {tags.map((tag) => {
            const selected = selectedTags.includes(tag.id);
            return (
              <Pressable
                accessibilityLabel={`${selected ? '取消' : '添加'}标签${tag.label}`}
                key={tag.id}
                onPress={() => onTagsChange(selected ? selectedTags.filter((item) => item !== tag.id) : [...selectedTags, tag.id])}
                style={[styles.pill, selected ? { backgroundColor: `${tag.color}22`, borderColor: tag.color } : null]}
              >
                <View style={[styles.dot, { backgroundColor: tag.color }]} /><AppText color={selected ? colors.foreground : colors.mutedForeground} variant="micro">{tag.label}</AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.section}>
        <Pressable accessibilityLabel={highlightMode ? '关闭高亮模式' : '开启高亮模式'} onPress={() => onHighlightModeChange(!highlightMode)} style={[styles.highlightToggle, highlightMode ? styles.highlightActive : null]}>
          <Highlighter color={highlightMode ? colors.primary : colors.mutedForeground} size={15} />
          <AppText color={highlightMode ? colors.primary : colors.mutedForeground} variant="caption">点词高亮</AppText>
        </Pressable>
        {highlightMode ? (
          <View style={styles.options}>
            {highlights.map((item) => (
              <Pressable accessibilityLabel={`高亮颜色${item.label}`} key={item.id} onPress={() => onColorChange(item.id)} style={[styles.colorButton, activeColor === item.id ? styles.colorActive : null]}>
                <View style={[styles.colorDot, { backgroundColor: item.color }]} /><AppText variant="micro">{item.label}</AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, gap: spacing[3], padding: spacing[3] },
  section: { gap: spacing[2] },
  labelRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5] },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  pill: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], paddingHorizontal: spacing[2.5], paddingVertical: spacing[1.5] },
  dot: { borderRadius: radii.full, height: 7, width: 7 },
  highlightToggle: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.full, flexDirection: 'row', gap: spacing[1.5], paddingVertical: spacing[1] },
  highlightActive: { backgroundColor: colors.primary08, paddingHorizontal: spacing[2] },
  colorButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  colorActive: { borderColor: colors.primary, backgroundColor: colors.primary06 },
  colorDot: { borderRadius: radii.full, height: 10, width: 10 },
});
