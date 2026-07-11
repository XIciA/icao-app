import { Highlighter, Search, Tags } from 'lucide-react-native';
import { useState } from 'react';
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
  const [tagsOpen, setTagsOpen] = useState(false);

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Pressable accessibilityLabel={dictionaryMode ? '关闭查词模式' : '开启查词模式'} onPress={() => onDictionaryModeChange(!dictionaryMode)} style={[styles.tool, dictionaryMode ? styles.toolActive : null]}>
          <Search color={dictionaryMode ? colors.primary : colors.mutedForeground} size={14} />
          <AppText color={dictionaryMode ? colors.primary : colors.mutedForeground} variant="caption">查词</AppText>
        </Pressable>
        <Pressable accessibilityLabel={highlightMode ? '关闭高亮模式' : '开启高亮模式'} onPress={() => onHighlightModeChange(!highlightMode)} style={[styles.tool, highlightMode ? styles.toolActive : null]}>
          <Highlighter color={highlightMode ? colors.primary : colors.mutedForeground} size={14} />
          <AppText color={highlightMode ? colors.primary : colors.mutedForeground} variant="caption">划线</AppText>
        </Pressable>
        <Pressable accessibilityLabel={tagsOpen ? '关闭标签面板' : '打开标签面板'} onPress={() => setTagsOpen((value) => !value)} style={[styles.tool, tagsOpen || selectedTags.length ? styles.toolActive : null]}>
          <Tags color={tagsOpen || selectedTags.length ? colors.primary : colors.mutedForeground} size={14} />
          <AppText color={tagsOpen || selectedTags.length ? colors.primary : colors.mutedForeground} variant="caption">标签 {selectedTags.length}</AppText>
        </Pressable>
      </View>
      {tagsOpen ? <View style={styles.section}>
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
      </View> : null}
      {highlightMode ? <View style={styles.section}>
          <View style={styles.options}>
            {highlights.map((item) => (
              <Pressable accessibilityLabel={`高亮颜色${item.label}`} key={item.id} onPress={() => onColorChange(item.id)} style={[styles.colorButton, activeColor === item.id ? styles.colorActive : null]}>
                <View style={[styles.colorDot, { backgroundColor: item.color }]} /><AppText variant="micro">{item.label}</AppText>
              </Pressable>
            ))}
          </View>
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  toolbar: { flexDirection: 'row', gap: spacing[2] },
  section: { gap: spacing[2] },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  pill: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], paddingHorizontal: spacing[2.5], paddingVertical: spacing[1.5] },
  dot: { borderRadius: radii.full, height: 7, width: 7 },
  tool: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 30, paddingHorizontal: spacing[3] },
  toolActive: { backgroundColor: colors.primary06, borderColor: colors.primary },
  colorButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  colorActive: { borderColor: colors.primary, backgroundColor: colors.primary06 },
  colorDot: { borderRadius: radii.full, height: 10, width: 10 },
});
