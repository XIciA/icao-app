import { Text, StyleSheet } from 'react-native';

import { colors, fonts } from '@/theme';

import type { CardLearningState } from '../types';

const tones = { green: '#CFEBD8', yellow: '#F8E7A9', red: '#F5C8CB' } as const;

export function InteractiveStudyText({
  blockId,
  dictionaryMode,
  highlightColor,
  highlightMode,
  highlights,
  onHighlightsChange,
  onLookup,
  text,
}: {
  blockId: 'question' | 'reference';
  dictionaryMode: boolean;
  highlightColor: 'green' | 'yellow' | 'red';
  highlightMode: boolean;
  highlights: NonNullable<CardLearningState['highlights']>;
  onHighlightsChange: (value: NonNullable<CardLearningState['highlights']>) => void;
  onLookup: (word: string) => void;
  text: string;
}) {
  let wordIndex = -1;
  return (
    <Text style={styles.text}>
      {text.split(/(\s+)/).map((part, tokenIndex) => {
        if (/^\s+$/.test(part)) return <Text key={`${tokenIndex}-space`}>{part}</Text>;
        wordIndex += 1;
        const index = wordIndex;
        const active = highlights.find((item) => item.blockId === blockId && item.wordIndex === index);
        return (
          <Text
            accessibilityLabel={dictionaryMode ? `查词：${part}` : highlightMode ? `${active ? '取消' : '添加'}高亮：${part}` : undefined}
            key={`${tokenIndex}-${part}`}
            onPress={dictionaryMode ? () => onLookup(part.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')) : highlightMode ? () => {
              const rest = highlights.filter((item) => !(item.blockId === blockId && item.wordIndex === index));
              onHighlightsChange(active ? rest : [...rest, { blockId, wordIndex: index, colorId: highlightColor, quote: part }]);
            } : undefined}
            style={active ? { backgroundColor: tones[active.colorId], textDecorationColor: colors.primary, textDecorationLine: 'underline' } : undefined}
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({ text: { color: colors.foreground, fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 25 } });
