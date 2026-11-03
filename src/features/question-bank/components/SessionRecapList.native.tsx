import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ChevronDown, ChevronRight, NotebookPen, Star } from '@/components/ui/icons';
import { AppText, Button, Screen } from '@/components/ui';
import { TopBar } from '@/components/navigation/TopBar';
import { colors, radii, spacing } from '@/theme';
import { useWordFavorites } from '@/features/vocabulary/progress-store.native';
import { useSaveAction } from '@/features/vocabulary/use-save-action.native';
import { findStaticWordLookup } from '../static-word-lookup/repository';
import { normalizeStaticLookupWord } from '../static-word-lookup/normalize';
import { useQuestionAnnotations } from '../annotations/use-question-annotations-with-save.native';
import { questionBankCardTargetKey } from '../annotations/card-index.native';
import { annotationBlockText } from '../annotations/text-block';
import type { AnnotationDefinition, AnnotationTextBlockId, QuestionAnnotationEntry } from '../annotations/types';
import { LookupPronunciation } from './LookupPronunciation';
import { AnnotationMarkers } from './AnnotationMarkers';
import { AnnotationText } from './AnnotationText';
import type { LearningRecord, QuestionBankCard, QuestionBankStudyItem } from '../types';
import { objectiveReview } from '../lib/session-recap';

export type SessionRecapKind = 'annotations' | 'words' | 'wrong';
export type SessionRecapViewState = { onlyFavorites: boolean; scrollY: number; expandedSources?: string[] };
type Props = {
  kind: SessionRecapKind; record: LearningRecord; onBack(): void; onOpen(id: string): void;
  initialViewState?: SessionRecapViewState; onViewStateChange?(state: SessionRecapViewState): void;
};

function cardTextBlocks(card: QuestionBankCard): AnnotationTextBlockId[] {
  return ['question', 'reference', ...(card.choices ?? []).map((_, index) => `choice-${index}`)] as AnnotationTextBlockId[];
}

export function SessionRecapList({ kind, record, onBack, onOpen, initialViewState, onViewStateChange }: Props) {
  const viewState = useRef<SessionRecapViewState>(initialViewState ?? { onlyFavorites: false, scrollY: 0 });
  const initialOffset = useRef({ x: 0, y: viewState.current.scrollY }).current;
  const [onlyFavorites, setOnlyFavorites] = useState(viewState.current.onlyFavorites);
  const [expandedSources, setExpandedSources] = useState(viewState.current.expandedSources ?? []);
  const { fontScale } = useWindowDimensions();
  const favorites = useWordFavorites();
  const save = useSaveAction();
  const annotations = useQuestionAnnotations();
  const definitions = useMemo(() => new Map(annotations.highlightDefinitions.map(item => [item.id, item])), [annotations.highlightDefinitions]);
  const title = kind === 'words' ? '查词' : kind === 'annotations' ? '标注题目' : '错题回顾';
  const selected = new Set(kind === 'annotations' ? record.sessionRecap?.annotatedCardIds : objectiveReview(record.studyReview).wrongIds);
  const items = record.studyReview?.items.filter(item => selected.has(kind === 'annotations' ? item.card.id : item.id)) ?? [];
  // One stable question per row, even when a study package revisits the same card.
  const annotatedItems = [...new Map(items.map(item => [questionBankCardTargetKey({ bankId: item.dataset.id, cardId: item.card.id, categoryId: item.category.id, topicId: item.topic.id }), item])).values()];
  const words = [...new Map((record.sessionRecap?.words ?? []).map(item => [normalizeStaticLookupWord(item.word), item])).values()]
    .filter(item => !onlyFavorites || favorites.isFavorite({ word: item.word }));
  function remember(patch: Partial<SessionRecapViewState>) {
    viewState.current = { ...viewState.current, ...patch };
    onViewStateChange?.(viewState.current);
  }
  const filter = <Pressable accessibilityRole="button" accessibilityLabel="仅收藏" accessibilityState={{ selected: onlyFavorites }}
    onPress={() => { setOnlyFavorites(!onlyFavorites); remember({ onlyFavorites: !onlyFavorites }); }}
    style={[styles.filter, onlyFavorites && styles.filterActive]}><AppText variant="caption" color={onlyFavorites ? colors.primary : colors.mutedForeground}>仅收藏</AppText></Pressable>;
  const loading = kind === 'annotations' ? !annotations.hydrated : kind === 'words' ? !favorites.ready : false;
  const loadError = kind === 'annotations' ? annotations.loadErrorMessage : kind === 'words' ? favorites.error : undefined;
  const retry = () => { if (kind === 'annotations') void annotations.refresh(); else void favorites.retry(); };
  const empty = kind === 'words' ? !words.length : !items.length;
  return save.wrap(<Screen scroll contentStyle={styles.screen} scrollProps={{ contentOffset: loading || loadError ? undefined : initialOffset, scrollEventThrottle: 32,
    onScroll: event => { if (!loading && !loadError) remember({ scrollY: event.nativeEvent.contentOffset.y }); } }}
    header={<TopBar title={title} onBack={onBack} actionWidth={kind === 'words' ? Math.min(96, Math.max(72, 64 * fontScale)) : undefined} right={kind === 'words' ? filter : undefined} />}>
    {loadError ? <View style={styles.empty}><AppText>{kind === 'annotations' ? '标注暂时无法读取' : '收藏状态暂时无法读取'}</AppText><Button variant="outline" onPress={retry}>重试</Button></View>
      : loading ? <View style={styles.empty}><AppText>正在读取{kind === 'words' ? '收藏状态' : '标注'}…</AppText></View>
      : empty ? <View style={styles.empty}><AppText>{kind === 'words' ? onlyFavorites ? '本次查词中还没有已收藏的单词' : '本次没有查词记录' : kind === 'annotations' ? '本次没有标注题目' : '本次没有错题'}</AppText>
        {kind === 'words' && onlyFavorites ? <Button variant="ghost" onPress={() => { setOnlyFavorites(false); remember({ onlyFavorites: false }); }}>查看本次查词</Button> : null}</View>
      : <View style={styles.list}>
        {kind === 'words' ? words.map(({ word }, index) => {
          const entry = findStaticWordLookup(word);
          const isFavorite = favorites.isFavorite({ word });
          const matches = (record.studyReview?.items ?? []).filter(item => cardTextBlocks(item.card).some(block => annotationBlockText(item.card, block).split(/\s+/).some(token => normalizeStaticLookupWord(token) === normalizeStaticLookupWord(word))));
          const sources = [...new Map(matches.map(item => [questionBankCardTargetKey({ bankId: item.dataset.id, cardId: item.card.id, categoryId: item.category.id, topicId: item.topic.id }), item])).values()];
          const expanded = expandedSources.includes(word);
          return <View key={word} style={[styles.item, index === words.length - 1 && styles.last]}>
            <View style={styles.wordHeading}><View style={styles.wordAndSound}><AppText variant="cardTitle" style={styles.word}>{word}</AppText><LookupPronunciation word={word} /></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`${isFavorite ? '取消收藏' : '收藏'} ${word}`} accessibilityState={{ selected: isFavorite, disabled: save.saving }}
                disabled={save.saving} style={styles.favorite} onPress={() => { void save.run(() => favorites.setFavorite({ word }, !isFavorite)); }}>
                <Star size={20} color={isFavorite ? colors.accent : colors.mutedForeground} fill={isFavorite ? colors.accent : 'transparent'} />
              </Pressable>
            </View>
            {entry?.ipa ? <AppText variant="caption">{entry.ipa}</AppText> : null}
            <AppText>{entry?.aviationMeaning || entry?.generalMeaning || '暂无释义'}</AppText>
            {sources.length === 1 ? <SourceLink item={sources[0]} onOpen={onOpen} /> : sources.length > 1 ? <>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={styles.source} onPress={() => {
                const next = expanded ? expandedSources.filter(value => value !== word) : [...expandedSources, word];
                setExpandedSources(next); remember({ expandedSources: next });
              }}><AppText variant="caption" style={styles.sourceText}>来源：{sources[0].card.taskTitle} 等 {sources.length} 题</AppText><ChevronDown size={14} color={colors.mutedForeground} /></Pressable>
              {expanded ? sources.map(item => <SourceLink key={item.id} item={item} onOpen={onOpen} />) : null}
            </> : null}
          </View>;
        }) : kind === 'annotations' ? annotatedItems.map((item, index) => {
          const entry = annotations.store.entries[questionBankCardTargetKey({ bankId: item.dataset.id, categoryId: item.category.id, topicId: item.topic.id, cardId: item.card.id })];
          return <AnnotatedQuestionRow key={item.id} item={item} entry={entry} definitions={definitions}
            tags={annotations.tagDefinitions.filter(tag => entry?.tagIds.includes(tag.id))} last={index === annotatedItems.length - 1} onOpen={onOpen} />;
        }) : items.map((item, index) => <Pressable accessibilityRole="button" key={item.id} onPress={() => onOpen(item.id)} style={[styles.item, index === items.length - 1 && styles.last]}>
          <View style={styles.heading}><AppText variant="button" style={styles.metadata}>{item.card.taskTitle}</AppText><ChevronRight color={colors.mutedForeground} size={20} /></View>
          <AppText numberOfLines={2}>{item.card.audioText ?? (item.card.kind === 'image' ? item.card.imageAlt : '')}</AppText>
          <AppText variant="caption">已选 {String.fromCharCode(65 + (record.studyReview?.states[item.id]?.selectedChoiceIndex ?? 0))} · 正确答案 {String.fromCharCode(65 + (item.card.correctChoiceIndex ?? 0))}</AppText>
        </Pressable>)}
      </View>}
  </Screen>);
}

function SourceLink({ item, onOpen }: { item: QuestionBankStudyItem; onOpen(id: string): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`查看来源 ${item.card.taskTitle}`} style={styles.source} onPress={() => onOpen(item.id)}>
    <AppText variant="caption" style={styles.sourceText}>来源：{item.card.taskTitle}</AppText><ChevronRight size={14} color={colors.mutedForeground} />
  </Pressable>;
}

function AnnotatedQuestionRow({ item, entry, tags, definitions, last, onOpen }: {
  item: QuestionBankStudyItem; entry?: QuestionAnnotationEntry; tags: AnnotationDefinition[];
  definitions: Map<string, AnnotationDefinition>; last: boolean; onOpen(id: string): void;
}) {
  const primary: AnnotationTextBlockId = item.card.audioText ? 'question' : 'reference';
  const blocks = cardTextBlocks(item.card).filter(block => annotationBlockText(item.card, block) && (block === primary || entry?.highlights.some(highlight => highlight.blockId === block)));
  return <Pressable accessibilityRole="button" accessibilityLabel={`查看标注题目 ${item.card.taskTitle}`} onPress={() => onOpen(item.id)} style={({ pressed }) => [styles.item, last && styles.last, pressed && styles.pressed]}>
    <View style={styles.heading}><AnnotationMarkers definitions={tags} />
      <AppText variant="caption" color={colors.foreground} style={styles.metadata}>{item.card.taskTitle}{tags.length ? ` · ${tags.map(tag => tag.label).join('、')}` : ''}</AppText>
      <ChevronRight color={colors.mutedForeground} size={18} />
    </View>
    {blocks.length ? blocks.map(block => <View key={block} style={styles.block}>
      {block !== 'question' ? <AppText variant="caption">{block === 'reference' ? '参考文本' : `选项 ${String.fromCharCode(65 + Number(block.slice(7)))}`}</AppText> : null}
      <AnnotationText sourceText={annotationBlockText(item.card, block)} blockId={block} highlights={entry?.highlights ?? []} definitions={definitions} />
    </View>) : <AppText>{(item.card.kind === 'image' ? item.card.imageAlt : '') || item.card.taskTitle}</AppText>}
    {entry?.note.trim() ? <View style={styles.note}><NotebookPen size={15} color={colors.mutedForeground} /><AppText variant="caption" style={styles.metadata}>{entry.note}</AppText></View> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing[5], paddingBottom: spacing[8] },
  list: { backgroundColor: colors.card, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing[4], overflow: 'hidden' },
  item: { paddingVertical: spacing[4], gap: spacing[2], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  last: { borderBottomWidth: 0 }, heading: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  metadata: { flex: 1, minWidth: 0 }, block: { gap: spacing[1] },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], paddingTop: spacing[1] },
  wordHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  wordAndSound: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', flex: 1, minWidth: 0 },
  word: { flexShrink: 1 }, favorite: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  filter: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing[2], borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border },
  filterActive: { backgroundColor: colors.primary06, borderColor: colors.primary },
  source: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing[1], minHeight: 44 },
  sourceText: { flexShrink: 1 }, empty: { alignItems: 'center', gap: spacing[3], paddingVertical: spacing[8] },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
