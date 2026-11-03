import { AnnotationQuestionRow } from './AnnotationQuestionRow.native';
import { CollectionList, CollectionRow } from '@/components/learning/CollectionList.native';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { studyDatasetIcons as bankIcons } from '@/features/profile/StudyBankIcon';
import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { GuideAnchor, useGuide, useGuideAvailability } from '@/features/usage-guide/GuideBindings';
import { useFocusEffect } from 'expo-router';
import { BookOpenText, Highlighter, NotebookPen, Search, Tag as TagIcon, type LucideIcon } from '@/components/ui/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

import { getEmbeddedQuestionBanks } from '../data/repository';
import type { QuestionBankId } from '../types';
import { annotationToneColors } from '../annotations/colors';
import { questionBankCardTargetKey } from '../annotations/card-index.native';
import { useCardReferences } from '../annotations/use-card-references.native';
import { cardIdentityKey, type CardReference } from '../data/card-references.native';
import { useQuestionAnnotations } from '../annotations/use-question-annotations';
import type { AnnotationDefinition, QuestionAnnotationEntry } from '../annotations/types';
import { QuestionBankSwitcherHeader } from './QuestionBankSwitcherHeader';

type AnnotationSegment = 'tags' | 'highlights' | 'notes';
type BankFilter = QuestionBankId | 'all';



const segments: { id: AnnotationSegment; label: string; icon: LucideIcon }[] = [
  { id: 'tags', label: '标签', icon: TagIcon },
  { id: 'highlights', label: '高亮', icon: Highlighter },
  { id: 'notes', label: '笔记', icon: NotebookPen },
];

export function MyAnnotationsScreen() {
  const router = useRouter();
  const guide = useGuide();
  const annotations = useQuestionAnnotations();
  useGuideAvailability('recap', annotations.loadErrorMessage || undefined);
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
  const recoveredNotes = annotations.store.recoveredNotes?.filter(note => bankId === 'all' || note.bankId === bankId) ?? [];
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
    return noteEntries.length + recoveredNotes.length;
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
  useEffect(() => { if (guide?.current === 'recap' && guide.step !== 'recap-record' && annotations.hydrated && !annotations.loadErrorMessage) guide.checkpoint({ recapEmpty: visibleEntries.length === 0 }); }, [annotations.hydrated, annotations.loadErrorMessage, guide, visibleEntries.length]);

  return (
    <Screen contentStyle={styles.screen}>
      <QuestionBankSwitcherHeader items={switcherItems} onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} onSelect={chooseBank} value={bankId} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.segmented}><GuideAnchor id="recap-filter" />
          {segments.map((item) => {
            const active = segment === item.id;
            return (
              <Pressable accessibilityState={{ selected: active }} key={item.id} onPress={() => chooseSegment(item.id)} style={[styles.segment, active ? styles.segmentActive : null]}>
                <AppText color={active ? colors.primary : colors.mutedForeground} variant="button">{item.label}</AppText>
                <View style={[styles.count, active ? styles.countActive : null]}><AppText color={active ? colors.primary : colors.mutedForeground} style={styles.countText} variant="micro">{countForSegment(item.id)}</AppText></View>
              </Pressable>
            );
          })}
        </View>

        {colorOptions.length ? (
          <View style={styles.filters}>
            <Pressable accessibilityState={{ selected: colorFilter.length === 0 }} onPress={() => setColorFilter([])} style={[styles.allFilter, colorFilter.length === 0 ? styles.filterActive : null]}>
              <AppText color={colorFilter.length === 0 ? colors.primary : colors.mutedForeground} variant="caption">全部</AppText>
            </Pressable>
            {colorOptions.map((option) => {
              const active = selectedColors.has(option.id);
              return (
                <Pressable accessibilityLabel={`筛选${option.label}`} accessibilityState={{ selected: active }} key={option.id} onPress={() => toggleColor(option.id)} style={[styles.colorFilter, active ? styles.filterActive : null]}>
                  <View style={[segment === 'highlights' ? styles.filterLine : styles.filterDot, { backgroundColor: annotationToneColors[option.tone] }]} />
                  <AppText color={active ? colors.primary : colors.foreground} variant="caption">{option.label}</AppText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {!annotations.hydrated ? <LoadingState /> : annotations.loadErrorMessage ? (
          <StateCard icon={Search} title="本机标注读取失败" description={annotations.loadErrorMessage} action={<Button onPress={() => void annotations.refresh()} variant="outline">重试</Button>} />
        ) : visibleEntries.length ? (
          <CollectionList style={styles.list}>
            {visibleEntries.map((entry, index) => <PersonalAnnotationRow entry={entry} segment={segment}
              tagDefinitions={tagDefinitionMap} highlightDefinitions={highlightDefinitionMap} colorFilter={selectedColors}
              resolution={references.values?.get(cardIdentityKey(entry))} key={questionBankCardTargetKey(entry)}
              last={index === visibleEntries.length - 1} onPress={() => openEntry(entry)} />)}
          </CollectionList>
        ) : segment === 'notes' && recoveredNotes.length ? null : <EmptyState allBanks={bankId === 'all'} filtered={colorFilter.length > 0} segment={segment} />}
        {segment === 'notes' && recoveredNotes.length ? <CollectionList style={styles.list}>{recoveredNotes.map((note, index) => <CollectionRow key={note.id} last={index === recoveredNotes.length - 1}><AppText selectable>{note.note}</AppText><AppText variant="micro">{note.reason === 'retired' ? '原题已不可用' : '冲突副本'}</AppText></CollectionRow>)}</CollectionList> : null}
      </ScrollView>

    </Screen>
  );
}

function referenceMessage(value?: CardReference) {
  if (!value) return '正在确认原题…';
  if (value.status === 'ready') return value.location?.card?.taskTitle || value.location?.topicTitle || '查看原题';
  return `${value.message}${value.status === 'unavailable' ? ' 点击重试' : value.status === 'membership-required' ? ' 点击查看会员权限' : ''}`;
}

function PersonalAnnotationRow({ entry, segment, colorFilter, tagDefinitions, highlightDefinitions, onPress, resolution, last }: {
  entry: QuestionAnnotationEntry; segment: AnnotationSegment; colorFilter: Set<string>; tagDefinitions: Map<string, AnnotationDefinition>;
  highlightDefinitions: Map<string, AnnotationDefinition>; resolution?: CardReference; onPress(): void; last: boolean;
}) {
  const card = resolution?.status === 'ready' ? resolution.location?.card : undefined;
  const tags = entry.tagIds.flatMap(id => tagDefinitions.get(id) ? [tagDefinitions.get(id)!] : []);
  const shownEntry = segment === 'highlights' && colorFilter.size ? { ...entry, highlights: entry.highlights.filter(item => colorFilter.has(item.colorId)) } : entry;
  const highlightMarkers = Array.from(new Set(shownEntry.highlights.map(item => item.colorId)))
    .flatMap(id => highlightDefinitions.get(id) ? [highlightDefinitions.get(id)!] : []);
  const first = shownEntry.highlights[0];
  return <AnnotationQuestionRow title={card?.taskTitle || resolution?.location?.topicTitle || '原题'} card={card} entry={shownEntry}
    mode={segment} markers={segment === 'highlights' ? highlightMarkers : tags} definitions={highlightDefinitions}
    last={last} onPress={onPress} disabled={resolution?.status === 'not-found'}
    fallback={segment === 'highlights' ? first?.sentence || first?.quote : undefined}
    feedback={resolution?.status !== 'ready' ? referenceMessage(resolution) : undefined}
    updatedLabel={segment === 'notes' ? `更新于 ${formatRelativeTime(entry.updatedAt)}` : undefined}
    anchor={<GuideAnchor id="recap-question" />} />;
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
  return <GlobalLoadingScreen />;
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
  segmented: { backgroundColor: colors.muted, borderRadius: radii.lg, flexDirection: 'row', gap: spacing[1], marginTop: 0, padding: spacing[1] },
  segment: { alignItems: 'center', borderRadius: radii.md, flex: 1, flexDirection: 'row', gap: spacing[1.5], justifyContent: 'center', minHeight: 42, paddingHorizontal: spacing[2] },
  segmentActive: { backgroundColor: colors.card },
  count: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.full, minWidth: 20, paddingHorizontal: 5, paddingVertical: 2 },
  countActive: { backgroundColor: colors.primary10 },
  countText: { fontFamily: fonts.monoRegular },
  filters: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1.5], marginTop: spacing[3] },
  allFilter: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, justifyContent: 'center', minHeight: 34, paddingHorizontal: spacing[2] },
  colorFilter: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1], minHeight: 34, paddingHorizontal: spacing[2] },
  filterActive: { backgroundColor: colors.primary06, borderColor: colors.primary },
  filterLine: { borderRadius: radii.full, height: 6, width: 16 },
  filterDot: { borderRadius: radii.full, height: 14, width: 14 },
  list: { marginTop: spacing[4] },
  stateCard: { alignItems: 'center', borderStyle: 'dashed', gap: spacing[3], marginTop: spacing[8], paddingHorizontal: spacing[6], paddingVertical: spacing[8] },
  stateIcon: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.full, height: 54, justifyContent: 'center', width: 54 },
  stateDescription: { maxWidth: 260, textAlign: 'center' },
});
