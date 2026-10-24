import { X } from '@/components/ui/icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, BottomSheet } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

export const answerCardWebGridStyle = { justifyContent: 'flex-start', maxWidth: '100%' } as const;
export const answerCardWebNumberStyle = { maxWidth: 48 } as const;
type Props = {
  visible: boolean; total: number; current: number; marked: Set<number>;
  results?: readonly ('correct' | 'incorrect' | undefined)[];
  tagColors?: readonly (readonly string[])[]; highlightColors?: readonly (readonly string[])[];
  markedLabel?: string; unmarkedLabel?: string;
  onSelect: (index: number) => void; onClose: () => void;
};
export function AnswerCardSheet(props: Props) {
  const { visible, total, current, marked, tagColors, highlightColors, onSelect, onClose } = props;
  const learned = Array.from(marked).filter(index => index >= 0 && index < total).length;
  return <BottomSheet accessibilityLabel="答题卡" visible={visible} onClose={onClose}>
    <View style={styles.header}><AppText variant="sectionTitle">答题卡</AppText><Pressable accessibilityLabel="关闭答题卡" onPress={onClose} style={styles.close}><X size={20} color={colors.foreground} /></Pressable></View>
    <View style={styles.stats}><AppText variant="body">共 {total} 题</AppText><AppText variant="body">已学习 {learned}</AppText><AppText variant="body">未学习 {total - learned}</AppText></View>
    <View style={styles.legend}><Legend label="当前" current /><Legend label="已学习" learned /><Legend label="未学习" /></View>
    <View style={styles.grid}>{Array.from({ length: total }, (_, index) => {
      const studied = marked.has(index), selected = current === index;
      const tags = [...new Set(tagColors?.[index] ?? [])], highlights = [...new Set(highlightColors?.[index] ?? [])];
      return <View key={index} style={styles.cell}><Pressable accessibilityRole="button" accessibilityLabel={`第 ${index + 1} 题`} accessibilityState={{ selected }} accessibilityHint={`${studied ? '已学习' : '未学习'}${tags.length ? `，${tags.length} 种标签` : ''}${highlights.length ? `，${highlights.length} 种高亮` : ''}`} onPress={() => onSelect(index)} style={({ pressed }) => [styles.number, studied && styles.learned, selected && styles.current, pressed && styles.pressed]}>
        <AppText color={studied || selected ? colors.primary : colors.foreground} style={styles.numberText}>{index + 1}</AppText>
        {tags.length ? <View pointerEvents="none" style={styles.tags}>{tags.slice(0, 4).map((color, i) => <View key={color} style={[styles.dot, { backgroundColor: color, zIndex: 5 - i }, i > 0 && styles.dotOverlap]} />)}</View> : null}
        {highlights.length ? <View pointerEvents="none" style={styles.highlights}>{highlights.slice(0, 3).map((color, i) => <View key={color} style={[styles.line, { backgroundColor: color, zIndex: 4 - i }, i > 0 && styles.lineOverlap]} />)}</View> : null}
      </Pressable></View>;
    })}</View>
  </BottomSheet>;
}
function Legend({ label, current, learned }: { label: string; current?: boolean; learned?: boolean }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, learned && styles.learned, current && styles.current]} /><AppText variant="body">{label}</AppText></View>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], justifyContent: 'space-between', marginVertical: spacing[3] }, legend: { flexDirection: 'row', gap: spacing[4], flexWrap: 'wrap', marginBottom: spacing[3] }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] }, legendDot: { width: 10, height: 10, borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', maxWidth: 368, alignSelf: 'center', paddingVertical: spacing[2] }, cell: { width: '20%', alignItems: 'center', paddingVertical: spacing[3] },
  number: { width: 48, height: 48, borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }, learned: { backgroundColor: colors.primary10, borderColor: colors.primary10 }, current: { borderWidth: 2, borderColor: colors.primary }, numberText: { fontFamily: fonts.monoRegular, textAlign: 'center' },
  tags: { position: 'absolute', right: -2, top: -3, flexDirection: 'row' }, dot: { height: 13, width: 13, borderRadius: radii.full, borderWidth: 2, borderColor: colors.card }, dotOverlap: { marginLeft: -5 },
  highlights: { position: 'absolute', right: -2, bottom: 3, flexDirection: 'row', alignItems: 'center' }, line: { height: 6, width: 16, borderRadius: radii.full, borderWidth: 1, borderColor: colors.card }, lineOverlap: { marginLeft: -7 }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
