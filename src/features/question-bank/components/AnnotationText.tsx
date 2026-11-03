import { Text } from 'react-native';
import { colors } from '@/theme';
import { AppText } from '@/components/ui';
import { annotationHighlightBackgrounds } from '../annotations/colors';
import { contentFingerprint, sentenceWordRangeAt, tokenizeStudyText } from '../annotations/text';
import type { AnnotationDefinition, AnnotationHighlight, AnnotationTextBlockId } from '../annotations/types';

type Props = {
  sourceText: string;
  blockId: AnnotationTextBlockId;
  highlights: AnnotationHighlight[];
  definitions: Map<string, AnnotationDefinition>;
  numberOfLines?: number;
  range?: { startWordIndex: number; endWordIndex: number };
};

/** Render original text, never move old highlights onto a changed text block. */
export function AnnotationText({ sourceText, blockId, highlights, definitions, numberOfLines, range }: Props) {
  const fingerprint = contentFingerprint(sourceText);
  const active = new Map(highlights.filter(item => item.blockId === blockId && item.contentFingerprint === fingerprint)
    .map(item => [item.wordIndex, item]));
  const allTokens = tokenizeStudyText(sourceText);
  const first = range && allTokens.find(token => token.wordIndex === range.startWordIndex);
  const last = range && allTokens.find(token => token.wordIndex === range.endWordIndex);
  const tokens = first && last ? allTokens.filter(token => token.start >= first.start && token.end <= last.end) : allTokens;
  const toneForWord = (index?: number) => index === undefined ? undefined : definitions.get(active.get(index)?.colorId ?? '')?.color;
  return <AppText color={colors.mutedForeground} numberOfLines={numberOfLines}>
    {tokens.map((token, index) => {
      if (token.whitespace) {
        const previous = toneForWord(tokens[index - 1]?.wordIndex);
        const next = toneForWord(tokens[index + 1]?.wordIndex);
        const connected = !token.text.includes('\n') && previous && previous === next ? previous : undefined;
        return <Text key={`space-${index}`} style={connected ? { backgroundColor: annotationHighlightBackgrounds[connected] } : undefined}>{token.text}</Text>;
      }
      const tone = toneForWord(token.wordIndex);
      return <Text key={`word-${token.wordIndex}`} accessibilityLabel={tone ? `高亮词：${token.text}` : undefined}
        style={tone ? { backgroundColor: annotationHighlightBackgrounds[tone] } : undefined}>{token.text}</Text>;
    })}
  </AppText>;
}

export function HighlightSentence({ sourceText, target, fallback, definitions, highlights }: {
  sourceText: string; target: AnnotationHighlight; fallback: string;
  definitions: Map<string, AnnotationDefinition>; highlights: AnnotationHighlight[];
}) {
  const range = sentenceWordRangeAt(sourceText, target.wordIndex);
  if (target.contentFingerprint !== contentFingerprint(sourceText) || !range) return <AppText numberOfLines={3}>{fallback}</AppText>;
  return <AnnotationText sourceText={sourceText} blockId={target.blockId} highlights={highlights} definitions={definitions} range={range} numberOfLines={3} />;
}
