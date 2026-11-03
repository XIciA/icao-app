import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, NotebookPen } from '@/components/ui/icons';
import { AppText } from '@/components/ui';
import { CollectionRow } from '@/components/learning/CollectionList.native';
import { colors, spacing } from '@/theme';
import type { QuestionBankCard } from '../types';
import { annotationBlockText, annotationCardTextBlocks } from '../annotations/text-block';
import type { AnnotationDefinition, QuestionAnnotationEntry } from '../annotations/types';
import { AnnotationMarkers } from './AnnotationMarkers';
import { AnnotationText, HighlightSentence } from './AnnotationText';
import { contentFingerprint } from '../annotations/text';

type Props = {
  title: string;
  card?: QuestionBankCard;
  entry?: QuestionAnnotationEntry;
  mode: 'tags' | 'highlights' | 'notes' | 'combined';
  markers: AnnotationDefinition[];
  definitions: Map<string, AnnotationDefinition>;
  onPress(): void;
  accessibilityLabel?: string;
  disabled?: boolean;
  last?: boolean;
  fallback?: string;
  feedback?: string;
  updatedLabel?: string;
  anchor?: ReactNode;
};

/** One question layout across the personal collection and session recap. */
export function AnnotationQuestionRow({ title, card, entry, mode, markers, definitions, onPress, accessibilityLabel,
  disabled, last, fallback, feedback, updatedLabel, anchor }: Props) {
  const [expanded, setExpanded] = useState(false);
  const highlighted = mode === 'highlights' || mode === 'combined';
  const primary = card?.audioText ? 'question' : 'reference';
  const highlights = entry?.highlights ?? [];
  const blocks = card ? annotationCardTextBlocks(card).filter(block => annotationBlockText(card, block) && (
    mode === 'highlights' ? highlights.some(item => item.blockId === block) : block === primary || mode === 'combined' && highlights.some(item => item.blockId === block)
  )) : [];
  const canExpand = mode !== 'combined' && (blocks.length > 1 || blocks.some(block => annotationBlockText(card, block).length > 180));
  // Keep the highlighted passage visible even when it is near the end of a long question.
  const focusHighlight = mode === 'highlights' ? highlights.find(item => definitions.has(item.colorId) &&
    blocks.includes(item.blockId) && item.contentFingerprint === contentFingerprint(annotationBlockText(card, item.blockId))) : undefined;
  const collapsed = canExpand && !expanded;
  const shown = collapsed ? [focusHighlight?.blockId ?? blocks[0]] : blocks;
  const fallbackText = fallback || (card?.kind === 'image' ? card.imageAlt : '') || title;
  return <CollectionRow last={last}>
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.content, pressed && styles.pressed, disabled && styles.unavailable]}>
      {anchor}
      <View style={styles.heading}>
        {mode !== 'notes' && markers.length > 0 ? <View style={styles.markers}><AnnotationMarkers definitions={markers} shape={mode === 'highlights' ? 'line' : 'dot'} /></View> : null}
        <View style={[styles.flex, styles.headingCopy]}><AppText variant="caption" color={colors.foreground} style={styles.title}>{title}</AppText>{markers.length && mode !== 'notes' ? <AppText variant="caption" color={colors.mutedForeground}>· {markers.map(item => item.label).join('、')}</AppText> : null}</View>
        {!disabled ? <ChevronRight color={colors.mutedForeground} size={18} /> : null}
      </View>
      {shown.length ? shown.map(block => <View key={block} style={styles.block}>
        {block !== 'question' ? <AppText variant="micro" color={colors.mutedForeground}>{block === 'reference' ? '参考文本' : `选项 ${String.fromCharCode(65 + Number(block.slice(7)))}`}</AppText> : null}
        {collapsed && focusHighlight?.blockId === block ? <HighlightSentence sourceText={annotationBlockText(card, block)} target={focusHighlight}
          fallback={focusHighlight.sentence || focusHighlight.quote} highlights={highlights} definitions={definitions} />
          : highlighted ? <AnnotationText sourceText={annotationBlockText(card, block)} blockId={block} highlights={highlights} definitions={definitions} numberOfLines={collapsed ? 3 : undefined} />
          : <AppText variant={mode === 'notes' ? 'caption' : 'body'} color={colors.mutedForeground} numberOfLines={canExpand && !expanded ? 3 : undefined}>{annotationBlockText(card, block)}</AppText>}
      </View>) : <AppText color={colors.mutedForeground}>{fallbackText}</AppText>}
      {mode === 'notes' || mode === 'combined' ? <AnnotationNote text={entry?.note} emphasized={mode === 'notes'} /> : null}
      {updatedLabel ? <AppText variant="micro" color={colors.mutedForeground}>{updatedLabel}</AppText> : null}
      {feedback ? <AppText variant="caption" color={colors.mutedForeground}>{feedback}</AppText> : null}
    </Pressable>
    {canExpand ? <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? '收起' : '展开'}原文 ${title}`} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.expand}>
      <AppText variant="caption" color={colors.primary}>{expanded ? '收起原文' : '展开原文'}</AppText>
    </Pressable> : null}
  </CollectionRow>;
}

export function AnnotationNote({ text, emphasized = false }: { text?: string; emphasized?: boolean }) {
  return text?.trim() ? <View style={styles.note}><NotebookPen size={15} color={colors.mutedForeground} /><AppText variant="caption" color={emphasized ? colors.foreground : colors.mutedForeground} style={styles.flex}>{text}</AppText></View> : null;
}

const styles = StyleSheet.create({
  content: { gap: spacing[2] }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], minHeight: 24 },
  headingCopy: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing[1] }, title: { flexShrink: 1 },
  markers: { paddingTop: spacing[1] },
  flex: { flex: 1, minWidth: 0 }, block: { gap: spacing[1] },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], paddingTop: spacing[1] },
  expand: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] }, unavailable: { opacity: 0.58 },
});
