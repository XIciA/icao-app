import { StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/theme';

import { sentenceAround } from '../annotations/text';
import type { AnnotationDefinition, AnnotationHighlight, AnnotationTextBlockId, AnnotationToneKey } from '../annotations/types';

const tones: Record<AnnotationToneKey, string> = {
  green: '#45A26B',
  yellow: '#D6A72D',
  red: '#D94A53',
  blue: colors.primary,
};

export function InteractiveStudyText({
  blockId,
  definitions,
  dictionaryMode,
  highlightMode,
  highlights,
  onHighlight,
  onLookup,
  text,
}: {
  blockId: AnnotationTextBlockId;
  definitions: AnnotationDefinition[];
  dictionaryMode: boolean;
  highlightMode: boolean;
  highlights: AnnotationHighlight[];
  onHighlight: (value: { blockId: AnnotationTextBlockId; wordIndex: number; quote: string; sentence: string; sourceText: string }) => void;
  onLookup: (value: { word: string; sentence: string }) => void;
  text: string;
}) {
  let wordIndex = -1;
  let cursor = 0;
  const definitionMap = new Map(definitions.map((definition) => [definition.id, definition]));

  return (
    <Text style={styles.text}>
      {text.split(/(\s+)/).map((part, tokenIndex) => {
        const start = cursor;
        const end = start + part.length;
        cursor = end;
        if (/^\s+$/.test(part)) return <Text key={`${tokenIndex}-space`}>{part}</Text>;
        wordIndex += 1;
        const index = wordIndex;
        const active = highlights.find((item) => item.blockId === blockId && item.wordIndex === index);
        const tone = active ? definitionMap.get(active.colorId)?.color ?? 'green' : undefined;
        return (
          <Text
            accessibilityLabel={dictionaryMode ? `查词：${part}` : highlightMode ? `${active ? '更新或取消' : '添加'}高亮：${part}` : undefined}
            key={`${tokenIndex}-${part}`}
            onPress={dictionaryMode ? () => onLookup({
              word: part.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''),
              sentence: sentenceAround(text, start, end),
            }) : highlightMode ? () => onHighlight({
              blockId,
              wordIndex: index,
              quote: part,
              sentence: sentenceAround(text, start, end),
              sourceText: text,
            }) : undefined}
            style={active ? { textDecorationColor: tones[tone ?? 'green'], textDecorationLine: 'underline', textDecorationStyle: 'solid' } : undefined}
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({ text: { color: colors.foreground, fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 25 } });
