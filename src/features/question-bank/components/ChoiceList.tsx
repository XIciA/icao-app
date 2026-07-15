import { Check, X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

type Props = {
  choices: string[];
  correctChoiceIndex?: number;
  selectedChoiceIndex?: number;
  showResult?: boolean;
  onSelect: (index: number) => void;
};

export function ChoiceList({ choices, correctChoiceIndex, selectedChoiceIndex, showResult = false, onSelect }: Props) {
  return (
    <View style={styles.list}>
      {choices.map((choice, index) => {
        const selected = selectedChoiceIndex === index;
        const correct = showResult && correctChoiceIndex === index;
        const incorrect = showResult && selected && correctChoiceIndex !== undefined && correctChoiceIndex !== index;
        return (
          <Pressable
            accessibilityLabel={`选项 ${String.fromCharCode(65 + index)}：${choice}`}
            accessibilityState={{ selected }}
            key={`${index}:${choice}`}
            onPress={() => onSelect(index)}
            style={({ pressed }) => [
              styles.choice,
              selected ? styles.selected : null,
              correct ? styles.correct : null,
              incorrect ? styles.incorrect : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <View testID={`choice-letter-${index}`} style={[
              styles.letter,
              selected ? styles.letterSelected : null,
              correct ? styles.letterCorrect : null,
              incorrect ? styles.letterIncorrect : null,
            ]}>
              <AppText color={correct || incorrect || selected ? colors.primaryForeground : colors.mutedForeground} variant="button">
                {String.fromCharCode(65 + index)}
              </AppText>
            </View>
            <AppText color={colors.foreground} style={styles.copy}>{choice}</AppText>
            {correct ? <Check accessibilityLabel="正确答案" color={colors.answerCorrect} size={18} /> : null}
            {incorrect ? <X accessibilityLabel="错误答案" color={colors.destructive} size={18} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[2] },
  choice: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[2], minHeight: 46, paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  selected: { borderColor: colors.primary },
  correct: { backgroundColor: colors.answerCorrectBackground, borderColor: colors.answerCorrectBorder },
  incorrect: { backgroundColor: 'rgba(219,43,51,0.06)', borderColor: 'rgba(219,43,51,0.45)' },
  letter: { alignItems: 'center', borderRadius: radii.full, height: 24, justifyContent: 'center', width: 24 },
  letterSelected: { backgroundColor: colors.primary },
  letterCorrect: { backgroundColor: colors.answerCorrect },
  letterIncorrect: { backgroundColor: colors.destructive },
  copy: { flex: 1 },
  pressed: { opacity: 0.75 },
});
