import { Check, X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

type Props = {
  choices: string[];
  correctChoiceIndex?: number;
  selectedChoiceIndex?: number;
  onSelect: (index: number) => void;
};

export function ChoiceList({ choices, correctChoiceIndex, selectedChoiceIndex, onSelect }: Props) {
  return (
    <View style={styles.list}>
      {choices.map((choice, index) => {
        const selected = selectedChoiceIndex === index;
        const correct = selectedChoiceIndex !== undefined && correctChoiceIndex === index;
        const incorrect = selected && correctChoiceIndex !== undefined && correctChoiceIndex !== index;
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
            <View style={[styles.letter, selected ? styles.letterSelected : null]}>
              <AppText color={selected ? colors.primaryForeground : colors.mutedForeground} variant="button">
                {String.fromCharCode(65 + index)}
              </AppText>
            </View>
            <AppText color={colors.foreground} style={styles.copy}>{choice}</AppText>
            {correct ? <Check color={colors.primary} size={18} /> : null}
            {incorrect ? <X color={colors.destructive} size={18} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[2.5] },
  choice: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, flexDirection: 'row', gap: spacing[3], minHeight: 54, padding: spacing[3] },
  selected: { borderColor: colors.primary20 },
  correct: { backgroundColor: colors.primary06, borderColor: colors.primary },
  incorrect: { backgroundColor: 'rgba(219,43,51,0.06)', borderColor: 'rgba(219,43,51,0.45)' },
  letter: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.full, height: 30, justifyContent: 'center', width: 30 },
  letterSelected: { backgroundColor: colors.primary },
  copy: { flex: 1 },
  pressed: { opacity: 0.75 },
});
