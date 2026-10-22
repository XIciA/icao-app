import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { GuideAnchor, useGuide } from '@/features/usage-guide/GuideBindings';
import { useFocusEffect } from 'expo-router';
import { BookOpenText, ChevronRight, Headphones, Highlighter, MessageSquareQuote, Mic2, NotebookPen, RadioTower, Search, Tag as TagIcon, type LucideIcon } from '@/components/ui/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { colors, fonts, radii, shadows, spacing } from '@/theme';

import { getEmbeddedQuestionBanks } from '../data/repository';
import type { QuestionBankDataset, QuestionBankId } from '../types';
import { annotationHighlightBackgrounds, annotationToneColors } from '../annotations/colors';
import { questionBankCardTargetKey } from '../annotations/card-index.native';
import { useCardReferences } from '../annotations/use-card-references.native';
import { cardIdentityKey, type CardReference } from '../data/card-references.native';
import { contentFingerprint, sentenceWordRangeAt, tokenizeStudyText } from '../annotations/text';
import { useQuestionAnnotations } from '../annotations/use-question-annotations';
import type { AnnotationDefinition, QuestionAnnotationEntry } from '../annotations/types';
import { QuestionBankSwitcherHeader } from './QuestionBankSwitcherHeader';

type AnnotationSegment = 'tags' | 'highlights' | 'notes';
type BankFilter = QuestionBankId | 'all';

const bankIcons: Record<QuestionBankDataset['icon'], LucideIcon> = {
  headphones: Headphones,
  sentences: MessageSquareQuote,
  radioTower: RadioTower,
  mic: Mic2,
  story: BookOpenText,
};

const segments: { id: AnnotationSegment; label: string; icon: LucideIcon }[] = [
  { id: 'tags', label: '标签', icon: TagIcon },
  { id: 'highlights', label: '高亮', icon: Highlighter },
  { id: 'notes', label: '笔记', icon: NotebookPen },
];

export function MyAnnotationsScreen() {
  const router = useRouter();
  const guide = useGuide();
  const annotations = useQuestionAnnotations();
  const banks = useMemo(getEmbeddedQuestionBanks, []);
  const [bankId, setBankId] = useState<BankFilter>('all');
  const [segment, setSegment] = useState<AnnotationSegment>('tags');
  const [colorFilter, setColorFilter] = useState<string[]>([]);
  const switcherItems = useMemo(() => [
    { icon: BookOpenText, label: '全部题库', summary: '汇总五套题库的标注与笔记', value: 'all' as const },
    ...banks.map((item) => ({ icon: bankIcons[item.icon], label: item.title, summary: item.summary, value: item.id })),
  ], [banks]);
  const refreshAnnotations = annotations.refresh;

  useFocusEffect(useCallback(() => {
    void refreshAnnotations();
  }, [refreshAnnotations]));

  const tagDefinitionMap = useMemo(() => new Map(annotations.tagDefinitions.map((item) => [item.id, item])), [annotations.tagDefinitions]);
  const highlightDefinitionMap = useMemo(() => new Map(annotations.highlightDefinitions.map((item) => [item.id, item])), [annotations.highlightDefinitions]);
  const selectedColors = useMemo(() => new Set(colorFilter), [colorFilter]);

  const bankEntries = useMemo(() => Object.values(annotations.store.entries)
    .filter((entry) => bankId === 'all' || entry.bankId === bankId)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)), [annotations.store.entries, bankId]);
  const references = useCardReferences(bankEntries);
  const tagEntries = useMemo(() => bankEntries.filter((entry) => entry.tagIds.length > 0), [bankEntries]);
  const highlightEntries = useMemo(() => bankEntries.filter((entry) => entry.highlights.length > 0), [bankEntries]);
  const noteEntries = useMemo(() => bankEntries.filter((entry) => Boolean(entry.note.trim())), [bankEntries]);

  const visibleTagEntries = useMemo(() => selectedColors.size === 0 ? tagEntries : tagEntries.filter((entry) => entry.tagIds.some((id) => {
    const definition = tagDefinitionMap.get(id);
    return definition ? selectedColors.has(definition.id) : false;
  })), [selectedColors, tagDefinitionMap, tagEntries]);
  const visibleHighlightEntries = useMemo(() => selectedColors.size === 0 ? highlightEntries : highlightEntries.filter((entry) => entry.highlights.some((highlight) => {
    const definition = highlightDefinitionMap.get(highlight.colorId);
    return definition ? selectedColors.has(definition.id) : false;
  })), [highlightDefinitionMap, highlightEntries, selectedColors]);

  const colorOptions = useMemo(() => {
    if (segment === 'notes') return [];
    const definitions = segment === 'tags' ? annotations.tagDefinitions : annotations.highlightDefinitions;
    return definitions.map((definition) => ({ id: definition.id, tone: definition.color, label: definition.label }));
  }, [annotations.highlightDefinitions, annotations.tagDefinitions, segment]);
  useEffect(() => {
    const available = new Set(colorOptions.map((option) => option.id));
    setColorFilter((current) => current.every((id) => available.has(id)) ? current : current.filter((id) => available.has(id)));
  }, [colorOptions]);


  function countForSegment(value: AnnotationSegment) {
    if (value === 'tags') return tagEntries.length;
    if (value === 'highlights') return highlightEntries.length;
    return noteEntries.length;
  }

  function chooseBank(value: BankFilter) {
    setBankId(value);
    setColorFilter([]);
  }

  function chooseSegment(value: AnnotationSegment) {
    setSegment(value);
    setColorFilter([]);
  }

  function toggleColor(value: string) {
    setColorFilter((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function openEntry(entry: QuestionAnnotationEntry) {
    const resolved = references.values?.get(cardIdentityKey(entry));
    if (resolved?.status === 'membership-required') { router.push('/account/membership'); return; }
    if (resolved?.status !== 'ready' || !resolved.location) { references.retry(); return; }
    const location = resolved.location;
    guide?.event('recap-question');
    router.push({
      pathname: '/question-bank/[bankId]/study/[categoryId]/[topicId]',
      params: { bankId: location.bankId, categoryId: location.categoryId, topicId: location.topicId, cardId: location.cardId, returnTo: 'annotations' },
    });
  }

  const visibleEntries = segment === 'tags' ? visibleTagEntries : segment === 'highlights' ? visibleHighlightEntries : noteEntries;
  useEffect(() => { if (guide?.current === 'recap' && annotations.hydrated) guide.checkpoint({ recapEmpty: visibleEntries.length === 0 }); }, [annotations.hydrated, guide, visibleEntries.length]);

  return (
    <Screen contentStyle={styles.screen}>
      <QuestionBankSwitcherHeader items={switcherItems} onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} onSelect={chooseBank} value={bankId} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.segmented}>
          {segments.map((item) => {
            const Icon = item.icon;
            const active = segment === item.id;
            return (
              <Pressable accessibilityState={{ selected: active }} key={item.id} onPress={() => chooseSegment(item.id)} style={[styles.segment, active ? styles.segmentActive : null]}>
                <Icon color={active ? colors.primary : colors.mutedForeground} size={16} />
                <AppText color={active ? colors.primary : colors.mutedForeground} variant="button">{item.label}</AppText>
                <View style={[styles.count, active ? styles.countActive : null]}><AppText color={active ? colors.primary : colors.mutedForeground} style={styles.countText} variant="micro">{countForSegment(item.id)}</AppText></View>
              </Pressable>
            );
          })}
        </View>

        {colorOptions.length ? (
          <View style={styles.filters}><GuideAnchor id="recap-filter" />
            <Pressable accessibilityState={{ selected: colorFilter.length === 0 }} onPress={() => setColorFilter([])} style={[styles.allFilter, colorFilter.length === 0 ? styles.filterActive : null]}>
              <AppText color={colorFilter.length === 0 ? colors.primary : colors.mutedForeground} variant="button">全部</AppText>
            </Pressable>
            {colorOptions.map((option) => {
              const active = selectedColors.has(option.id);
              return (
                <Pressable accessibilityLabel={`筛选${option.label}`} accessibilityState={{ selected: active }} key={option.id} onPress={() => toggleColor(option.id)} style={[styles.colorFilter, active ? styles.filterActive : null]}>
                  <View style={[styles.filterDot, { backgroundColor: annotationToneColors[option.tone] }]} />
                  <AppText color={active ? colors.primary : colors.foreground} variant="button">{option.label}</AppText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {!annotations.hydrated ? <LoadingState /> : annotations.loadErrorMessage ? (
          <StateCard icon={Search} title="本机标注读取失败" description={annotations.loadErrorMessage} action={<Button onPress={() => void annotations.refresh()} variant="outline">重试</Button>} />
        ) : visibleEntries.length ? (
          <View style={styles.list}>
            {segment === 'tags' ? visibleTagEntries.map((entry) => <TagRow definitions={tagDefinitionMap} entry={entry} resolution={references.values?.get(cardIdentityKey(entry))} key={questionBankCardTargetKey(entry)} onPress={() => openEntry(entry)} />) : null}
            {segment === 'highlights' ? visibleHighlightEntries.map((entry) => <HighlightRow colorFilter={selectedColors} definitions={highlightDefinitionMap} entry={entry} resolution={references.values?.get(cardIdentityKey(entry))} key={questionBankCardTargetKey(entry)} onPress={() => openEntry(entry)} />) : null}
            {segment === 'notes' ? noteEntries.map((entry) => <NoteRow entry={entry} resolution={references.values?.get(cardIdentityKey(entry))} key={questionBankCardTargetKey(entry)} onPress={() => openEntry(entry)} />) : null}
          </View>
        ) : <EmptyState allBanks={bankId === 'all'} filtered={colorFilter.length > 0} segment={segment} />}
      </ScrollView>

    </Screen>
  );
}

function referenceMessage(value?: CardReference) {
  if (!value) return '正在确认原题…';
  if (value.status === 'ready') return value.location?.card?.taskTitle || value.location?.topicTitle || '查看原题';
  return `${value.message}${value.status === 'unavailable' ? ' 点击重试' : value.status === 'membership-required' ? ' 点击查看会员权限' : ''}`;
}

function TagRow({ definitions, entry, onPress, resolution }: { definitions: Map<string, AnnotationDefinition>; entry: QuestionAnnotationEntry; resolution?: CardReference; onPress: () => void }) {
  const reference = resolution?.location;
  const available = resolution?.status !== 'not-found';
  const tags = entry.tagIds.flatMap((id) => definitions.get(id) ? [definitions.get(id)!] : []);
  return (
    <Pressable accessibilityRole="button" disabled={!available} onPress={onPress} style={({ pressed }) => [styles.rowCard, pressed ? styles.pressed : null, !available ? styles.unavailable : null]}><GuideAnchor id="recap-question" />
      <View style={styles.rowCopy}>
        <AppText numberOfLines={2}>{reference?.card?.audioText || reference?.card?.taskTitle || reference?.topicTitle || referenceMessage(resolution)}</AppText>
        <AppText variant="micro">{referenceMessage(resolution)} · {tags.map((tag) => tag.label).join('、')}</AppText>
      </View>
      <View accessibilityLabel={`已添加${tags.length}个标签：${tags.map((tag) => tag.label).join('、')}`} style={styles.dotStack}>{tags.map((tag, index) => <View key={tag.id} style={[styles.stackDot, { backgroundColor: annotationToneColors[tag.color] }, index ? styles.stackDotOverlap : null]} />)}</View>
      {available ? <ChevronRight color={colors.mutedForeground} size={20} /> : null}
    </Pressable>
  );
}

function HighlightRow({ colorFilter, definitions, entry, onPress, resolution }: { colorFilter: Set<string>; definitions: Map<string, AnnotationDefinition>; entry: QuestionAnnotationEntry; resolution?: CardReference; onPress: () => void }) {
  const available = resolution?.status !== 'not-found';
  const visible = entry.highlights.filter((highlight) => {
    if (!colorFilter.size) return true;
    const definition = definitions.get(highlight.colorId);
    return definition ? colorFilter.has(definition.id) : false;
  });
  const first = visible[0] ?? entry.highlights[0];
  const uniqueDefinitions = Array.from(new Map(visible.flatMap((highlight) => {
    const definition = definitions.get(highlight.colorId);
    return definition ? [[definition.id, definition] as const] : [];
  })).values());
  const reference = resolution?.location;
  const sourceText = first.blockId === 'question' ? reference?.card?.audioText ?? '' : reference?.card?.referenceText ?? '';
  const sentenceRange = sentenceWordRangeAt(sourceText, first.wordIndex);
  const shownIndexes = sentenceRange ? new Set(visible.filter((highlight) => highlight.blockId === first.blockId && highlight.wordIndex >= sentenceRange.startWordIndex && highlight.wordIndex <= sentenceRange.endWordIndex).map((highlight) => highlight.wordIndex)) : new Set<number>();
  const otherCount = visible.filter((highlight) => !shownIndexes.has(highlight.wordIndex) || highlight.blockId !== first.blockId).length;
  return (
    <Pressable accessibilityRole="button" disabled={!available} onPress={onPress} style={({ pressed }) => [styles.rowCard, pressed ? styles.pressed : null, !available ? styles.unavailable : null]}><GuideAnchor id="recap-question" />
      <View style={styles.dotStack}>{uniqueDefinitions.map((definition, index) => <View key={definition.id} style={[styles.stackDot, { backgroundColor: annotationToneColors[definition.color] }, index ? styles.stackDotOverlap : null]} />)}</View>
      <View style={styles.rowCopy}>
        <HighlightSentence definitions={definitions} fallback={first.sentence || first.quote || reference?.card?.audioText || reference?.card?.taskTitle || reference?.topicTitle || referenceMessage(resolution)} highlights={visible} sourceText={sourceText} target={first} />
        <AppText variant="micro">{referenceMessage(resolution)} · {uniqueDefinitions.map((item) => item.label).join('、')}{otherCount ? ` · 另有 ${otherCount} 个词被高亮` : ''}</AppText>
      </View>
      {available ? <ChevronRight color={colors.mutedForeground} size={20} /> : null}
    </Pressable>
  );
}

function HighlightSentence({ definitions, fallback, highlights, sourceText, target }: {
  definitions: Map<string, AnnotationDefinition>;
  fallback: string;
  highlights: QuestionAnnotationEntry['highlights'];
  sourceText: string;
  target: QuestionAnnotationEntry['highlights'][number];
}) {
  if (target.contentFingerprint !== contentFingerprint(sourceText)) return <AppText numberOfLines={3}>{fallback}</AppText>;
  const range = sentenceWordRangeAt(sourceText, target.wordIndex);
  if (!range) return <AppText numberOfLines={3}>{fallback}</AppText>;
  const active = new Map(highlights.filter((highlight) => highlight.blockId === target.blockId).map((highlight) => [highlight.wordIndex, highlight]));
  const words = tokenizeStudyText(sourceText).filter((token) => !token.whitespace);
  const first = words.find((token) => token.wordIndex === range.startWordIndex);
  const last = words.find((token) => token.wordIndex === range.endWordIndex);
  if (!first || !last) return <AppText numberOfLines={3}>{fallback}</AppText>;
  const tokens = tokenizeStudyText(sourceText).filter((token) => token.start >= first.start && token.end <= last.end);
  const toneForWord = (wordIndex?: number) => {
    if (wordIndex === undefined) return undefined;
    const highlight = active.get(wordIndex);
    return highlight ? definitions.get(highlight.colorId)?.color : undefined;
  };
  return (
    <AppText numberOfLines={3}>
      {tokens.map((token, index) => {
        if (token.whitespace) {
          const previousTone = toneForWord(tokens[index - 1]?.wordIndex);
          const nextTone = toneForWord(tokens[index + 1]?.wordIndex);
          const connectedTone = !token.text.includes('\n') && previousTone && previousTone === nextTone ? previousTone : undefined;
          return <Text key={`space-${index}`} style={connectedTone ? { backgroundColor: annotationHighlightBackgrounds[connectedTone] } : undefined}>{token.text}</Text>;
        }
        const highlight = active.get(token.wordIndex!);
        const tone = highlight ? definitions.get(highlight.colorId)?.color : undefined;
        return <Text accessibilityLabel={highlight ? `高亮词：${token.text}` : undefined} key={`word-${token.wordIndex}`} style={tone ? { backgroundColor: annotationHighlightBackgrounds[tone] } : undefined}>{token.text}</Text>;
      })}
    </AppText>
  );
}

function NoteRow({ entry, onPress, resolution }: { entry: QuestionAnnotationEntry; resolution?: CardReference; onPress: () => void }) {
  const available = resolution?.status !== 'not-found';
  return (
    <Pressable accessibilityRole="button" disabled={!available} onPress={onPress} style={({ pressed }) => [styles.rowCard, pressed ? styles.pressed : null, !available ? styles.unavailable : null]}><GuideAnchor id="recap-question" />
      <View style={styles.noteIcon}><NotebookPen color={colors.primary} size={16} /></View>
      <View style={styles.rowCopy}><AppText numberOfLines={3}>{entry.note}</AppText><AppText variant="micro">{referenceMessage(resolution)} · {formatRelativeTime(entry.updatedAt)}</AppText></View>
      {available ? <ChevronRight color={colors.mutedForeground} size={20} /> : null}
    </Pressable>
  );
}

function formatRelativeTime(value: string) {
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return '刚刚';
  if (elapsed < 3_600_000) return `${Math.max(1, Math.floor(elapsed / 60_000))} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.max(1, Math.floor(elapsed / 3_600_000))} 小时前`;
  if (elapsed < 604_800_000) return `${Math.max(1, Math.floor(elapsed / 86_400_000))} 天前`;
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value));
}

function LoadingState() {
  return <StateCard description="正在读取本机标注…" icon={Search} title="正在汇总" />;
}

function EmptyState({ allBanks, filtered, segment }: { allBanks: boolean; filtered: boolean; segment: AnnotationSegment }) {
  const label = segment === 'tags' ? '标签' : segment === 'highlights' ? '高亮' : '笔记';
  return <StateCard description={filtered ? '试试切换或清除颜色筛选。' : `在做题时给题目添加${label}，就会汇总到这里。`} icon={Search} title={filtered ? `没有匹配该颜色的${label}` : `${allBanks ? '全部题库' : '这个题库'}还没有${label}`} />;
}

function StateCard({ action, description, icon: Icon, title }: { action?: React.ReactNode; description: string; icon: LucideIcon; title: string }) {
  return (
    <Card style={styles.stateCard}>
      <View style={styles.stateIcon}><Icon color={colors.mutedForeground} size={22} /></View>
      <AppText variant="cardTitle">{title}</AppText>
      <AppText style={styles.stateDescription}>{description}</AppText>
      {action}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  scroll: { flexGrow: 1, paddingBottom: spacing[8], paddingHorizontal: spacing[5], paddingTop: spacing[4] },
  segmented: { backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1], marginTop: spacing[4], padding: spacing[1] },
  segment: { alignItems: 'center', borderRadius: radii.full, flex: 1, flexDirection: 'row', gap: spacing[1.5], justifyContent: 'center', minHeight: 42, paddingHorizontal: spacing[2] },
  segmentActive: { backgroundColor: colors.primary10 },
  count: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.full, minWidth: 20, paddingHorizontal: 5, paddingVertical: 2 },
  countActive: { backgroundColor: colors.primary10 },
  countText: { fontFamily: fonts.monoRegular },
  filters: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[3] },
  allFilter: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, justifyContent: 'center', minHeight: 34, paddingHorizontal: spacing[3] },
  colorFilter: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 34, paddingHorizontal: spacing[3] },
  filterActive: { backgroundColor: colors.primary06, borderColor: colors.primary },
  filterDot: { borderRadius: radii.full, height: 14, width: 14 },
  list: { gap: spacing[2.5], marginTop: spacing[4] },
  rowCard: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.xxl, borderWidth: 1, flexDirection: 'row', gap: spacing[3], minHeight: 82, padding: spacing[4], ...shadows.card },
  rowCopy: { flex: 1, gap: spacing[2] },
  dotStack: { alignItems: 'center', flexDirection: 'row', paddingRight: 2 },
  stackDot: { borderColor: colors.card, borderRadius: radii.full, borderWidth: 2, height: 13, width: 13 },
  stackDotOverlap: { marginLeft: -5 },
  noteIcon: { alignItems: 'center', backgroundColor: colors.primary045, borderRadius: radii.full, height: 34, justifyContent: 'center', width: 34 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  unavailable: { opacity: 0.58 },
  stateCard: { alignItems: 'center', borderStyle: 'dashed', gap: spacing[3], marginTop: spacing[8], paddingHorizontal: spacing[6], paddingVertical: spacing[8] },
  stateIcon: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.full, height: 54, justifyContent: 'center', width: 54 },
  stateDescription: { maxWidth: 260, textAlign: 'center' },
});
