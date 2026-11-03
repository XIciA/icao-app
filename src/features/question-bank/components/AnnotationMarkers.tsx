import { StyleSheet, View } from 'react-native';
import { colors, radii } from '@/theme';
import { annotationToneColors } from '../annotations/colors';
import type { AnnotationDefinition } from '../annotations/types';

/** One marker geometry for annotations and session recap; tags stay tightly stacked. */
export function AnnotationMarkers({ definitions, shape = 'dot' }: { definitions: AnnotationDefinition[]; shape?: 'dot' | 'line' }) {
  if (!definitions.length) return null;
  return <View accessibilityLabel={shape === 'dot'
    ? `已添加${definitions.length}个标签：${definitions.map(item => item.label).join('、')}`
    : `高亮颜色：${definitions.map(item => item.label).join('、')}`} style={styles.stack}>
    {definitions.map((item, index) => <View key={item.id} style={[
      shape === 'dot' ? styles.dot : styles.line,
      { backgroundColor: annotationToneColors[item.color] },
      shape === 'line' ? { zIndex: definitions.length - index } : null,
      index ? shape === 'dot' ? styles.dotOverlap : styles.lineOverlap : null,
    ]} />)}
  </View>;
}

const styles = StyleSheet.create({
  stack: { alignItems: 'center', flexDirection: 'row', paddingRight: 2, flexShrink: 0 },
  dot: { borderColor: colors.card, borderRadius: radii.full, borderWidth: 2, height: 13, width: 13 },
  dotOverlap: { marginLeft: -5 },
  line: { borderColor: colors.card, borderRadius: radii.full, borderWidth: 1, height: 6, width: 16 },
  lineOverlap: { marginLeft: -7 },
});
