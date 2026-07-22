import { Check, X } from 'lucide-react-native';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

import type { WordLookupInteraction } from '../lib/word-lookup-interaction';
import { normalizeStaticLookupWord } from '../static-word-lookup/normalize';
import { InteractiveWordTarget } from './InteractiveWordTarget';

type Props = {
  choices: string[];
  correctChoiceIndex?: number;
  selectedChoiceIndex?: number;
  showResult?: boolean;
  onSelect: (index: number) => void;
  onLookupWord?: (word: string) => void;
  isLookupAvailable?: (word: string) => boolean;
  lookupInteraction?: WordLookupInteraction;
};

type ChoiceRowProps = Pick<Props, 'correctChoiceIndex' | 'selectedChoiceIndex' | 'showResult' | 'onSelect' | 'onLookupWord' | 'isLookupAvailable' | 'lookupInteraction'> & {
  choice: string;
  index: number;
};

function ChoiceRow({ choice, correctChoiceIndex, selectedChoiceIndex, showResult, onSelect, onLookupWord, isLookupAvailable, lookupInteraction = 'long-press', index }: ChoiceRowProps) {
  const lookupHandled = useRef(false);
  const selected = selectedChoiceIndex === index;
  const correct = showResult && correctChoiceIndex === index;
  const incorrect = showResult && selected && correctChoiceIndex !== undefined && correctChoiceIndex !== index;
  const choose = () => {
    if (lookupHandled.current) {
      lookupHandled.current = false;
      return;
    }
    onSelect(index);
  };

  return (
    <Pressable
      accessibilityLabel={`选项 ${String.fromCharCode(65 + index)}：${choice}`}
      accessible={lookupInteraction === 'tap' && Boolean(onLookupWord) ? false : undefined}
      accessibilityState={{ selected }}
      onPress={choose}
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
      <View style={styles.copy}>{choice.split(/(\s+)/).map((token, tokenIndex) => {
        const word = normalizeStaticLookupWord(token);
        const lookupAllowed = Boolean(word && onLookupWord && (isLookupAvailable?.(word) ?? true));
        const lookupByTap = lookupAllowed && lookupInteraction === 'tap';
        const lookupByLongPress = lookupAllowed && lookupInteraction === 'long-press';
        if (lookupByTap) return (
          <InteractiveWordTarget accessibilityLabel={`查词：${word}`} key={`${tokenIndex}:${token}`} onPress={() => onLookupWord!(word!)} textStyle={styles.copyText}>
            {token}
          </InteractiveWordTarget>
        );
        if (!lookupByTap && !lookupByLongPress) return <Text key={`${tokenIndex}:${token}`} style={styles.copyText}>{token}</Text>;
        return <Text accessibilityLabel={`长按查词：${word}`} key={`${tokenIndex}:${token}`} onLongPress={lookupByLongPress ? () => {
          lookupHandled.current = true;
          onLookupWord!(word!);
        } : undefined} style={styles.copyText}>{token}</Text>;
      })}</View>
      {correct ? <Check accessibilityLabel="正确答案" color={colors.answerCorrect} size={18} /> : null}
      {incorrect ? <X accessibilityLabel="错误答案" color={colors.destructive} size={18} /> : null}
    </Pressable>
  );
}

export function ChoiceList({ choices, correctChoiceIndex, selectedChoiceIndex, showResult = false, onSelect, onLookupWord, isLookupAvailable, lookupInteraction }: Props) {
  return (
    <View style={styles.list}>
      {choices.map((choice, index) => <ChoiceRow choice={choice} correctChoiceIndex={correctChoiceIndex} index={index} isLookupAvailable={isLookupAvailable} key={`${index}:${choice}`} lookupInteraction={lookupInteraction} onLookupWord={onLookupWord} onSelect={onSelect} selectedChoiceIndex={selectedChoiceIndex} showResult={showResult} />)}
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
  copy: { alignItems: 'baseline', flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  copyText: { color: colors.foreground, fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22 },
  pressed: { opacity: 0.75 },
});
