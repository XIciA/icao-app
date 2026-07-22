import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import type { LayoutRectangle } from 'react-native';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { colors, fonts, spacing } from '@/theme';

import { annotationHighlightBackgrounds } from '../annotations/colors';
import { sentenceAround, tokenizeStudyText } from '../annotations/text';
import type { AnnotationDefinition, AnnotationHighlight, AnnotationTextBlockId, AnnotationToneKey } from '../annotations/types';
import type { WordLookupInteraction } from '../lib/word-lookup-interaction';
import { normalizeStaticLookupWord } from '../static-word-lookup/normalize';
import { InteractiveWordTarget } from './InteractiveWordTarget';

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
  isLookupAvailable,
  lookupInteraction = 'long-press',
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
  isLookupAvailable?: (word: string) => boolean;
  lookupInteraction?: WordLookupInteraction;
  lookupEnabled: boolean;
  onHighlight: (value: { blockId: AnnotationTextBlockId; wordIndex: number; quote: string; sentence: string; sourceText: string }) => void;
  onHighlightRange: (value: { action: 'apply' | 'remove'; blockId: AnnotationTextBlockId; endWordIndex: number; sourceText: string; startWordIndex: number }) => void;
  onLookup: (word: string) => void;
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
          const lookupWord = normalizeStaticLookupWord(token.text);
          const lookupAllowed = lookupEnabled && !highlightMode && Boolean(lookupWord) && (isLookupAvailable?.(lookupWord!) ?? true);
          const lookupByTap = lookupAllowed && dictionaryMode && lookupInteraction === 'tap';
          const lookupByLongPress = lookupAllowed && lookupInteraction === 'long-press';
          const highlightByTap = highlightMode && Platform.OS === 'web';
          const wordSpacingStyle = lineBreaks ? null : connectsToNext ? styles.connectedWord : styles.wordSpacing;
          if (lookupByTap || highlightByTap) {
            return (
              <Fragment key={`${index}-${token.text}`}>
                <InteractiveWordTarget
                  accessibilityLabel={lookupByTap ? `查词：${token.text}` : `${active ? '更新或取消' : '添加'}高亮：${token.text}`}
                  onPress={lookupByTap ? () => onLookup(lookupWord!) : () => onHighlight({
                    blockId,
                    wordIndex: index,
                    quote: token.text,
                    sentence: sentenceAround(text, token.start, token.end),
                    sourceText: text,
                  })}
                  style={wordSpacingStyle}
                  textStyle={[styles.word, backgroundColor ? { backgroundColor } : null]}
                >
                  {token.text}
                </InteractiveWordTarget>
                {lineBreaks ? <View style={[styles.lineBreak, lineBreaks > 1 ? { height: (lineBreaks - 1) * 25 } : null]} /> : null}
              </Fragment>
            );
          }
          return (
            <Fragment key={`${index}-${token.text}`}>
              <Text
                accessibilityLabel={highlightMode ? `${active ? '更新或取消' : '添加'}高亮：${token.text}` : lookupByLongPress ? `长按查词：${token.text}` : undefined}
                onLayout={(event) => boxesRef.current.set(index, event.nativeEvent.layout)}
                onLongPress={lookupByLongPress ? () => onLookup(lookupWord!) : undefined}
                onPress={highlightMode ? () => onHighlight({
                  blockId,
                  wordIndex: index,
                  quote: token.text,
                  sentence: sentenceAround(text, token.start, token.end),
                  sourceText: text,
                }) : undefined}
                style={[styles.word, wordSpacingStyle, backgroundColor ? { backgroundColor } : null]}
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
