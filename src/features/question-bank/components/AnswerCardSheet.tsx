import { Check, X } from '@/components/ui/icons';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText, BottomSheet } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';
import { isVercelLegacyWeb } from '@/config/web-runtime';

const ANSWER_CARD_NUMBER_HEIGHT = 40;
const ANSWER_CARD_GRID_MAX_WIDTH = 368;
const ANSWER_CARD_WEB_NUMBER_MAX_WIDTH = 62;

export const answerCardWebGridStyle = { justifyContent: 'space-between', maxWidth: '100%' } as const;
export const answerCardWebNumberStyle = { maxWidth: ANSWER_CARD_WEB_NUMBER_MAX_WIDTH } as const;

type Props = {
  visible: boolean;
  total: number;
  current: number;
  marked: Set<number>;
  results?: readonly ('correct' | 'incorrect' | undefined)[];
  tagColors?: readonly (readonly string[])[];
  markedLabel?: string;
  unmarkedLabel?: string;
  onSelect: (index: number) => void;
  onClose: () => void;
};

export function AnswerCardSheet({ visible, total, current, marked, results, tagColors, markedLabel = '已学', unmarkedLabel = '未学', onSelect, onClose }: Props) {
  const vercelLegacyWeb = isVercelLegacyWeb(Platform.OS);
  const showResults = results?.some(Boolean);
  return (
    <BottomSheet accessibilityLabel="答题卡" onClose={onClose} visible={visible}>
      <View style={styles.header}><AppText variant="sectionTitle">答题卡</AppText><Pressable accessibilityLabel="关闭答题卡" onPress={onClose} style={styles.close}><X color={colors.foreground} size={20} /></Pressable></View>
      <View style={[styles.legend, styles.legendWrap]}>
        <Legend color={colors.primary} label="当前" />
        {showResults ? <>
          <Legend color={colors.answerCorrect} label="答对" />
          <Legend color={colors.destructive} label="答错" />
        </> : null}
        <Legend color={colors.primary10} label={markedLabel} />
        <Legend color={colors.background} label={unmarkedLabel} outlined />
      </View>
      <View style={[styles.grid, Platform.OS === 'web' ? answerCardWebGridStyle : null]}>
        {Array.from({ length: total }, (_, index) => {
          const isCurrent = index === current;
          const isMarked = marked.has(index);
          const result = results?.[index];
          const dots = tagColors?.[index] ?? [];
          const resultColor = result === 'correct' ? colors.answerCorrect : result === 'incorrect' ? colors.destructive : undefined;
          const textColor = resultColor ?? (isCurrent ? colors.primaryForeground : isMarked ? colors.primary : colors.foreground);
          return (
            <Pressable
              accessibilityLabel={`第 ${index + 1} 题`}
              accessibilityHint={[result === 'correct' ? '答对' : result === 'incorrect' ? '答错' : isMarked ? markedLabel : unmarkedLabel, dots.length ? `已添加${dots.length}个标签` : ''].filter(Boolean).join('，')}
              accessibilityState={{ selected: isCurrent }}
              key={index}
              onPress={() => onSelect(index)}
              style={({ pressed }) => [
                styles.number,
                Platform.OS === 'web' ? answerCardWebNumberStyle : null,
                isCurrent ? styles.numberCurrent : isMarked ? styles.numberMarked : null,
                result === 'correct' ? styles.numberCorrect : result === 'incorrect' ? styles.numberIncorrect : null,
                result && isCurrent ? styles.resultCurrent : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <AppText
                color={textColor}
                style={styles.numberText}
                variant="button"
              >
                {index + 1}
              </AppText>
              {vercelLegacyWeb && isMarked && (!isCurrent || result) ? <Check color={resultColor ?? colors.primary} size={10} style={styles.check} /> : null}
              {dots.length ? <View pointerEvents="none" style={[styles.tagDots, vercelLegacyWeb ? styles.legacyTagPosition : styles.tagPosition]}>{dots.map((color, dotIndex) => (
                <View key={`${color}-${dotIndex}`} style={[styles.tagDot, { backgroundColor: color }, dotIndex ? styles.tagDotOverlap : null]} />
              ))}</View> : null}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

function Legend({ color, label, outlined = false }: { color: string; label: string; outlined?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }, outlined ? styles.outlined : null]} />
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  close: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  legendWrap: { flexWrap: 'wrap' },
  legend: { flexDirection: 'row', gap: spacing[4], marginTop: spacing[4] },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5] },
  legendDot: { borderRadius: radii.full, height: 12, width: 12 },
  outlined: { borderColor: colors.border, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], maxWidth: ANSWER_CARD_GRID_MAX_WIDTH, paddingBottom: spacing[5], paddingTop: spacing[4], width: '100%' },
  number: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, height: ANSWER_CARD_NUMBER_HEIGHT, justifyContent: 'center', position: 'relative', width: '17%' },
  numberCurrent: { backgroundColor: colors.primary, borderColor: colors.primary },
  numberMarked: { backgroundColor: colors.primary10, borderColor: colors.primary20 },
  numberCorrect: { backgroundColor: colors.answerCorrectBackground, borderColor: colors.answerCorrectBorder },
  numberIncorrect: { backgroundColor: 'rgba(219,43,51,0.06)', borderColor: 'rgba(219,43,51,0.45)' },
  resultCurrent: { borderColor: colors.primary, borderWidth: 2 },
  tagDots: { alignItems: 'center', flexDirection: 'row', position: 'absolute' },
  legacyTagPosition: { left: 2, top: -3 },
  tagPosition: { right: 2, top: 0 },
  tagDot: { borderColor: colors.card, borderRadius: radii.full, borderWidth: 2, height: 13, width: 13 },
  tagDotOverlap: { marginLeft: -5 },
  numberText: { fontFamily: fonts.monoRegular, height: ANSWER_CARD_NUMBER_HEIGHT, includeFontPadding: false, lineHeight: ANSWER_CARD_NUMBER_HEIGHT, textAlign: 'center', textAlignVertical: 'center', width: '100%' },
  check: { position: 'absolute', right: 4, top: 4 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.95 }] },
});
