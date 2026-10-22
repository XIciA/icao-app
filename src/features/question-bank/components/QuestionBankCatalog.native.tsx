import { useFocusEffect } from 'expo-router';
import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { AirlineMark, hasAirlineMark } from './AirlineMark';
import { SentenceExportScreen } from '../export/SentenceExportScreen';

import {
  Download,
  BookOpenText,
  Check,
  ChevronDown,
  ChevronRight,
  CloudLightning,
  Cog,
  Compass,
  Headphones,
  Library,
  MessageSquareQuote,
  Mic2,
  RadioTower,
  Shield,
  UserRound,
  Wrench,
  type LucideIcon,
} from '@/components/ui/icons';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { SoftGlow } from '@/components/visual/SoftGlow';
import { colors, fonts, radii, shadows, spacing } from '@/theme';

import { loadCatalogProgress, type CatalogProgressMap } from '../lib/catalog-progress';
import type { QuestionBankCategory, QuestionBankDataset, QuestionBankTopic } from '../types';
import { QuestionBankSwitcherHeader } from './QuestionBankSwitcherHeader';
import { useStudyCatalog } from '../hooks/useStudyCatalog.native';
import { useProfile } from '@/features/account/profile-store.native';
import { normalizeStudyScope } from '@icao/contracts';

const icons: LucideIcon[] = [CloudLightning, Cog, RadioTower, Wrench];
const bankIcons: Record<QuestionBankDataset['icon'], LucideIcon> = {
  headphones: Headphones,
  sentences: MessageSquareQuote,
  radioTower: RadioTower,
  mic: Mic2,
  story: BookOpenText,
};

export function QuestionBankCatalog({ dataset, exportDataset, warning, onRetry }: { dataset: QuestionBankDataset; exportDataset?: QuestionBankDataset; warning?: string; onRetry?: () => void }) {
  const router = useRouter();
  const [exporting,setExporting] = useState(false);
  const [expanded, setExpanded] = useState<string>();
  const [progress, setProgress] = useState<CatalogProgressMap>({});
  const [progressError, setProgressError] = useState(false);
  const [progressReady, setProgressReady] = useState(false);
  const [progressAttempt, setProgressAttempt] = useState(0);
  const scopedCatalog = useStudyCatalog();
  const scope = normalizeStudyScope(useProfile().studyScope);
  const switcherItems = useMemo(() => scopedCatalog.map((item) => ({
    icon: bankIcons[item.icon],
    label: item.title,
    summary: `${item.categories.length} ${item.categoryUnit} / ${item.declaredCardCount} ${item.cardUnit}`,
    value: item.id,
  })), [scopedCatalog]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setProgressReady(false); setProgressError(false);
    void loadCatalogProgress(dataset.categories.flatMap((category) => category.topics), scope).then((next) => {
      if (active) { setProgress(next); setProgressReady(true); }
    }).catch(() => { if (active) setProgressError(true); });
    return () => { active = false; };
  // Manual retry reloads progress while the catalog remains focused.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, scope, progressAttempt]));

  function isLocked(topic: QuestionBankTopic) {
    return dataset.access?.membershipActive !== true
      && topic.access?.level === 'member'
      && topic.access.availableCardCount === 0;
  }

  function openTopic(category: QuestionBankCategory, topic: QuestionBankTopic) {
    if (isLocked(topic)) {
      router.push('/account/membership?from=learning');
      return;
    }
    router.push({
      pathname: '/question-bank/[bankId]/study/[categoryId]/[topicId]',
      params: { bankId: dataset.id, categoryId: category.id, topicId: topic.id },
    });
  }

  function accessLabel(topic: QuestionBankTopic) {
    if (isLocked(topic)) return '会员';
    if (
      dataset.access?.membershipActive !== true
      && topic.access?.level === 'member'
      && topic.access.availableCardCount > 0
    ) return `${topic.access.availableCardCount}题免费`;
    return undefined;
  }

  if (exporting) return <SentenceExportScreen dataset={exportDataset ?? dataset} onBack={() => setExporting(false)} />;
  return (
    <Screen background={<SoftGlow intensity={0.75} size={360} style={styles.glow} />} contentStyle={styles.screen}>
      <QuestionBankSwitcherHeader
        right={dataset.id === 'sentences900' ? <Pressable accessibilityRole="button" accessibilityLabel="导出900句 PDF" hitSlop={10} onPress={() => setExporting(true)}><Download size={21} color={colors.primary}/></Pressable> : undefined}
        items={switcherItems}
        onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
        onSelect={(nextBankId) => router.replace({ pathname: '/question-bank/[bankId]', params: { bankId: nextBankId } })}
        value={dataset.id}
      />
      <View style={styles.scrollFrame}>
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {warning ? <View><AppText>暂时无法更新题库，正在显示本机已有目录，最新内容可能尚未包含。</AppText><Button variant="outline" onPress={onRetry}>重新加载题库</Button></View> : null}
          {progressError ? <View><AppText>学习进度暂时无法读取，记录未被清除。题目仍可学习。</AppText><Button variant="outline" onPress={() => setProgressAttempt(n => n + 1)}>重试读取进度</Button></View> : null}
          {dataset.categories.map((category, categoryIndex) => {
            const singleTopic = category.topics.length === 1 ? category.topics[0] : undefined;
            const isExpanded = !singleTopic && expanded === category.id;
            const categoryLearned = category.topics.reduce((sum, topic) => sum + (progress[topic.id]?.learned ?? 0), 0);
            const Icon = icons[categoryIndex % icons.length];
            const airline = dataset.id === 'radiotelephony' && hasAirlineMark(category.name);
            const singleLabel = singleTopic ? accessLabel(singleTopic) : undefined;
            return (
              <Card key={category.id} style={[styles.category, isExpanded ? styles.categoryExpanded : null]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => singleTopic ? openTopic(category, singleTopic) : setExpanded(isExpanded ? undefined : category.id)}
                  style={({ pressed }) => [styles.categoryHeader, pressed ? styles.pressed : null]}
                >
                  <View style={[styles.categoryIcon, airline ? styles.airlineIcon : isExpanded ? styles.categoryIconExpanded : null]}>
                    {airline ? <AirlineMark code={category.name} size={20}/> : singleTopic && isLocked(singleTopic)
                      ? <Shield color={colors.primary} size={19} />
                      : <Icon color={isExpanded ? colors.primaryForeground : colors.primary} size={20} />}
                  </View>
                  <View style={styles.categoryCopy}>
                    <AppText variant="cardTitle">{category.name}</AppText>
                    <AppText numberOfLines={1} variant="caption">
                      {singleTopic
                        ? `${category.declaredCardCount} ${dataset.cardUnit}`
                        : `${category.declaredTopicCount} ${category.topics.every((topic) => topic.practiceKind === 'scoring-points') ? '专项' : dataset.topicUnit} / ${category.declaredCardCount} ${dataset.cardUnit}`}
                    </AppText>
                  </View>
                  {singleLabel ? <View style={styles.accessPill}><AppText color={colors.primary} variant="micro">{singleLabel}</AppText></View> : null}
                  <View style={styles.countPill}>
                    {progressReady && categoryLearned >= category.declaredCardCount && category.declaredCardCount > 0 ? <Check color={colors.primary} size={12} /> : null}
                    <AppText color={categoryLearned ? colors.primary : colors.mutedForeground} style={styles.countText} variant="micro">
                      {progressReady ? `${categoryLearned}/${category.declaredCardCount}` : '进度待读取'}
                    </AppText>
                  </View>
                  {singleTopic
                    ? <ChevronRight color={colors.mutedForeground} size={20} />
                    : <ChevronDown color={colors.mutedForeground} size={20} style={isExpanded ? styles.rotated : undefined} />}
                </Pressable>
                {isExpanded ? (
                  <View style={styles.topicList}>
                    {category.topics.map((topic, topicIndex) => {
                      const topicProgress = progress[topic.id] ?? { learned: 0, total: topic.declaredCardCount };
                      const label = accessLabel(topic);
                      return (
                        <Pressable
                          accessibilityRole="button"
                          key={topic.id}
                          onPress={() => openTopic(category, topic)}
                          style={({ pressed }) => [styles.topic, pressed ? styles.pressed : null]}
                        >
                          <View style={styles.topicNumber}>
                            {isLocked(topic)
                              ? <Shield color={colors.primary} size={13} />
                              : <AppText style={styles.topicNumberText} variant="micro">{topicIndex + 1}</AppText>}
                          </View>
                          <View style={styles.topicCopy}>
                            <AppText numberOfLines={1} variant="button">{topic.name}</AppText>
                            <View style={styles.topicProgressRow}>
                              <View style={styles.topicProgressTrack}>
                                <View style={[styles.topicProgressFill, { width: `${!progressReady ? 0 : Math.min(100, (topicProgress.learned / Math.max(1, topicProgress.total)) * 100)}%` }]} />
                              </View>
                              <AppText style={styles.topicCount} variant="micro">{label ?? (progressReady ? `${topicProgress.learned}/${topicProgress.total}` : '进度待读取')}</AppText>
                            </View>
                          </View>
                          <ChevronRight color={colors.mutedForeground} size={17} />
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </Card>
            );
          })}
        </ScrollView>
      </View>
      <CatalogBottomNav onNavigate={(route) => router.dismissTo(route)} />
    </Screen>
  );
}

function CatalogBottomNav({ onNavigate }: { onNavigate: (route: '/(tabs)' | '/(tabs)/discover' | '/(tabs)/profile') => void }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bottomNav, { bottom: Math.max(insets.bottom, spacing[4]) }]}>
    <Pressable onPress={() => onNavigate('/(tabs)')} style={[styles.navItem, styles.navActive]}><Library color={colors.primary} size={19} /><AppText color={colors.primary} variant="button">题库</AppText></Pressable>
    <Pressable accessibilityLabel="发现" onPress={() => onNavigate('/(tabs)/discover')} style={styles.navIcon}><Compass color={colors.mutedForeground} size={19} /></Pressable>
    <Pressable accessibilityLabel="我的" onPress={() => onNavigate('/(tabs)/profile')} style={styles.navIcon}><UserRound color={colors.mutedForeground} size={19} /></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  glow: { left: 8, top: -230 },
  scrollFrame: { flex: 1 },
  list: { gap: spacing[3], paddingBottom: 112, paddingHorizontal: spacing[5], paddingTop: spacing[3] },
  category: { padding: 0, ...shadows.card },
  categoryExpanded: { borderColor: colors.primary20 },
  categoryHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], minHeight: 74, padding: spacing[4] },
  categoryIcon: { alignItems: 'center', backgroundColor: colors.primary045, borderRadius: radii.full, height: 40, justifyContent: 'center', width: 40 },
  airlineIcon: { borderRadius: radii.full },
  categoryIconExpanded: { backgroundColor: colors.primary },
  categoryCopy: { flex: 1, minWidth: 0 },
  accessPill: { backgroundColor: colors.primary10, borderRadius: radii.full, paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  countPill: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.full, flexDirection: 'row', gap: 3, paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  countText: { fontFamily: fonts.monoRegular },
  rotated: { transform: [{ rotate: '180deg' }] },
  topicList: { borderTopColor: colors.border, borderTopWidth: 1 },
  topic: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing[3], minHeight: 62, paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  topicNumber: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.full, height: 25, justifyContent: 'center', width: 25 },
  topicNumberText: { color: colors.mutedForeground, fontFamily: fonts.sansSemibold },
  topicCopy: { flex: 1, minWidth: 0 },
  topicProgressRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], marginTop: spacing[1.5] },
  topicProgressTrack: { backgroundColor: colors.secondary, borderRadius: radii.full, flex: 1, height: 5, overflow: 'hidden' },
  topicProgressFill: { backgroundColor: colors.primary, borderRadius: radii.full, height: '100%' },
  topicCount: { color: colors.mutedForeground, fontFamily: fonts.monoRegular, minWidth: 44, textAlign: 'right' },
  pressed: { opacity: 0.72 },
  bottomNav: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.background72, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[2], padding: spacing[1.5], position: 'absolute', ...shadows.floating },
  navItem: { alignItems: 'center', borderRadius: radii.full, flexDirection: 'row', gap: spacing[1.5], height: 40, paddingHorizontal: spacing[4] },
  navActive: { backgroundColor: colors.primary10 },
  navIcon: { alignItems: 'center', height: 40, justifyContent: 'center', width: 44 },
});
