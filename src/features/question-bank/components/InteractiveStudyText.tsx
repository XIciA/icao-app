import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import type { LayoutRectangle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { colors, fonts, spacing } from '@/theme';

import { annotationHighlightBackgrounds } from '../annotations/colors';
import { sentenceAround, tokenizeStudyText } from '../annotations/text';
import type { AnnotationDefinition, AnnotationHighlight, AnnotationTextBlockId, AnnotationToneKey } from '../annotations/types';

type DragSelection = {
  action: 'apply' | 'remove';
  endWordIndex: number;
  startWordIndex: number;
};

export function InteractiveStudyText({
  activeHighlightId,
  blockId,
  definitions,
  dictionaryMode,
  highlightMode,
  highlights,
  lookupEnabled,
  onHighlight,
  onHighlightRange,
  onLookup,
  text,
}: {
  activeHighlightId: string;
  blockId: AnnotationTextBlockId;
  definitions: AnnotationDefinition[];
  dictionaryMode: boolean;
  highlightMode: boolean;
  highlights: AnnotationHighlight[];
  lookupEnabled: boolean;
  onHighlight: (value: { blockId: AnnotationTextBlockId; wordIndex: number; quote: string; sentence: string; sourceText: string }) => void;
  onHighlightRange: (value: { action: 'apply' | 'remove'; blockId: AnnotationTextBlockId; endWordIndex: number; sourceText: string; startWordIndex: number }) => void;
  onLookup: (value: { word: string; sentence: string }) => void;
  text: string;
}) {
  const tokens = useMemo(() => tokenizeStudyText(text), [text]);
  const definitionMap = useMemo(() => new Map(definitions.map((definition) => [definition.id, definition])), [definitions]);
  const highlightMap = useMemo(() => new Map(highlights.filter((item) => item.blockId === blockId).map((item) => [item.wordIndex, item])), [blockId, highlights]);
  const boxesRef = useRef(new Map<number, LayoutRectangle>());
  const dragRef = useRef<DragSelection | undefined>(undefined);
  const [dragSelection, setDragSelection] = useState<DragSelection>();

  const wordAt = useCallback((x: number, y: number) => {
    for (const [wordIndex, box] of boxesRef.current) {
      if (x >= box.x - 3 && x <= box.x + box.width + 3 && y >= box.y - 3 && y <= box.y + box.height + 3) return wordIndex;
    }
    return undefined;
  }, []);

  const beginDrag = useCallback((x: number, y: number) => {
    const wordIndex = wordAt(x, y);
    if (wordIndex === undefined) return;
    const existing = highlights.find((item) => item.blockId === blockId && item.wordIndex === wordIndex);
    const next: DragSelection = {
      action: existing?.colorId === activeHighlightId ? 'remove' : 'apply',
      endWordIndex: wordIndex,
      startWordIndex: wordIndex,
    };
    dragRef.current = next;
    setDragSelection(next);
  }, [activeHighlightId, blockId, highlights, wordAt]);

  const updateDrag = useCallback((x: number, y: number) => {
    const current = dragRef.current;
    const wordIndex = wordAt(x, y);
    if (!current || wordIndex === undefined || wordIndex === current.endWordIndex) return;
    const next = { ...current, endWordIndex: wordIndex };
    dragRef.current = next;
    setDragSelection(next);
  }, [wordAt]);

  const commitDrag = useCallback(() => {
    const current = dragRef.current;
    if (!current) return;
    onHighlightRange({ ...current, blockId, sourceText: text });
  }, [blockId, onHighlightRange, text]);

  const clearDrag = useCallback(() => {
    dragRef.current = undefined;
    setDragSelection(undefined);
  }, []);

  const dragGesture = useMemo(() => Gesture.Pan()
    .enabled(highlightMode)
    .activateAfterLongPress(220)
    .onStart((event) => beginDrag(event.x, event.y))
    .onUpdate((event) => updateDrag(event.x, event.y))
    .onEnd(commitDrag)
    .onFinalize(clearDrag)
    .runOnJS(true), [beginDrag, clearDrag, commitDrag, highlightMode, updateDrag]);

  const previewStart = dragSelection ? Math.min(dragSelection.startWordIndex, dragSelection.endWordIndex) : -1;
  const previewEnd = dragSelection ? Math.max(dragSelection.startWordIndex, dragSelection.endWordIndex) : -1;
  const activeTone = definitionMap.get(activeHighlightId)?.color ?? 'green';
  const toneForWord = (wordIndex: number) => {
    const previewed = wordIndex >= previewStart && wordIndex <= previewEnd;
    if (previewed && dragSelection?.action === 'remove') return undefined;
    if (previewed && dragSelection?.action === 'apply') return activeTone;
    const highlight = highlightMap.get(wordIndex);
    return highlight ? definitionMap.get(highlight.colorId)?.color ?? 'green' : undefined;
  };

  return (
    <GestureDetector gesture={dragGesture}>
      <View collapsable={false} style={styles.textFlow}>
        {tokens.map((token, tokenIndex) => {
          if (token.whitespace) return null;
          const index = token.wordIndex!;
          const active = highlightMap.get(index);
          const previewed = index >= previewStart && index <= previewEnd;
          const tone = toneForWord(index);
          const backgroundColor = previewed && dragSelection?.action === 'remove'
            ? colors.secondary
            : tone ? annotationHighlightBackgrounds[tone as AnnotationToneKey] : undefined;
          const trailingWhitespace = tokens[tokenIndex + 1]?.whitespace ? tokens[tokenIndex + 1].text : '';
          const lineBreaks = trailingWhitespace.match(/\n/g)?.length ?? 0;
          const nextToken = trailingWhitespace ? tokens[tokenIndex + 2] : tokens[tokenIndex + 1];
          const connectsToNext = Boolean(tone && trailingWhitespace && !lineBreaks && nextToken?.wordIndex !== undefined && toneForWord(nextToken.wordIndex) === tone);
          const lookupAllowed = lookupEnabled && !highlightMode;
          return (
            <Fragment key={`${index}-${token.text}`}>
              <Text
                accessibilityLabel={dictionaryMode ? `查词：${token.text}` : highlightMode ? `${active ? '更新或取消' : '添加'}高亮：${token.text}` : lookupAllowed ? `长按查词：${token.text}` : undefined}
                onLayout={(event) => boxesRef.current.set(index, event.nativeEvent.layout)}
                onLongPress={lookupAllowed ? () => onLookup({
                  word: token.text.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''),
                  sentence: sentenceAround(text, token.start, token.end),
                }) : undefined}
                onPress={dictionaryMode && !highlightMode ? () => onLookup({
                  word: token.text.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''),
                  sentence: sentenceAround(text, token.start, token.end),
                }) : highlightMode ? () => onHighlight({
                  blockId,
                  wordIndex: index,
                  quote: token.text,
                  sentence: sentenceAround(text, token.start, token.end),
                  sourceText: text,
                }) : undefined}
                style={[styles.word, lineBreaks ? null : connectsToNext ? styles.connectedWord : styles.wordSpacing, backgroundColor ? { backgroundColor } : null]}
              >
                {token.text}
              </Text>
              {lineBreaks ? <View style={[styles.lineBreak, lineBreaks > 1 ? { height: (lineBreaks - 1) * 25 } : null]} /> : null}
            </Fragment>
          );
        })}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  connectedWord: { paddingRight: spacing[1] },
  lineBreak: { flexBasis: '100%', height: 0 },
  textFlow: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap' },
  word: { color: colors.foreground, fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 25 },
  wordSpacing: { marginRight: spacing[1] },
});
