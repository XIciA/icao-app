import { useSentenceBrowseMode } from '../lib/use-sentence-browse-mode';
import { contentReleaseOf } from '../data/content-version.native';
import { sqliteLearningStore } from '../platform/learning-store';
import { SENTENCE_SCENARIOS, sentenceScenario, sentenceScenarioCount, sentenceScenarioPackage } from '../lib/sentence-scenarios';
import { questionBankRepository } from '../data/repository.native';
import { useAuth } from '@/features/auth/AuthProvider';
import { GUIDE_FLOWS } from '@/features/usage-guide/guide-flows';
import { studyDatasetIcons as bankIcons } from '@/features/profile/StudyBankIcon';
import { useLoginEntry } from '@/features/auth/use-login-entry';
import { GuideAnchor, useGuide } from '@/features/usage-guide/GuideBindings';
import { useFocusEffect } from 'expo-router';
import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { hasAirlineMark } from './AirlineMark';
import { QuestionBankCategoryIcon } from './QuestionBankCategoryIcon';
import { SentenceExportScreen } from '../export/SentenceExportScreen';

import {
  Download,
  SlidersHorizontal,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Library,
  Shield,
  UserRound,
} from '@/components/ui/icons';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, BottomSheet, Button, Card, Screen } from '@/components/ui';
import { SoftGlow } from '@/components/visual/SoftGlow';
import { colors, fonts, radii, shadows, spacing } from '@/theme';

import { loadCatalogProgress, type CatalogProgressMap } from '../lib/catalog-progress';
import type { QuestionBankCategory, QuestionBankDataset, QuestionBankStudyPackage, QuestionBankTopic } from '../types';
import { QuestionBankSwitcherHeader } from './QuestionBankSwitcherHeader';
import { useStudyCatalog } from '../hooks/useStudyCatalog.native';
import { useProfile } from '@/features/account/profile-store.native';
import { normalizeStudyScope } from '@icao/contracts';



const ScenarioStudyScreen = lazy(() => import('./QuestionBankStudyScreen.native').then(module => ({ default: module.QuestionBankStudyScreen })));

export function QuestionBankCatalog({ dataset, exportDataset, warning, onRetry }: { dataset: QuestionBankDataset; exportDataset?: QuestionBankDataset; warning?: string; onRetry?: () => void }) {
  const router = useRouter();
  const account = useAuth().account?.accountId;
  const owner = useRef(account); owner.current = account;
  const [sceneProgress, setSceneProgress] = useState<Record<string, number>>({});
  const [sceneMode, setSceneMode] = useSentenceBrowseMode();
  const [browseMenuVisible, setBrowseMenuVisible] = useState(false);
  function selectBrowseMode(scene: boolean) { setSceneMode(scene); setBrowseMenuVisible(false); }
  const [scenePackage, setScenePackage] = useState<QuestionBankStudyPackage>();
  const [sceneBusy, setSceneBusy] = useState(false);
  const [sceneError, setSceneError] = useState('');
  const sceneGeneration = useRef(0);
  useEffect(() => { sceneGeneration.current += 1; setScenePackage(undefined); setSceneBusy(false); setSceneError(''); return () => { sceneGeneration.current += 1; }; }, [account, dataset]);
  async function openScene(id: string) {
    if (sceneBusy) return;
    const generation = ++sceneGeneration.current;
    const accountAtStart = account;
    setSceneBusy(true); setSceneError('');
    try {
      const categories = await Promise.all(dataset.categories.map(async category => ({ ...category,
        topics: await Promise.all(category.topics.map(async topic => await questionBankRepository.getTopic(dataset.id, category.id, topic.id, contentReleaseOf(dataset)) ?? topic)),
      })));
      if (generation !== sceneGeneration.current || owner.current !== accountAtStart) return;
      const next = sentenceScenarioPackage({ ...dataset, categories }, id);
      if (!next.items.length) { login('/account/membership', '登录后查看会员题库'); return; }
      setScenePackage(next);
    } catch { if (generation === sceneGeneration.current) setSceneError('场景题目加载失败，请重新点击场景重试。'); }
    finally { if (generation === sceneGeneration.current) setSceneBusy(false); }
  }
  const guide = useGuide();
  const offer = guide?.offer;
  useEffect(() => { if (dataset.id === 'sentences900') offer?.('export', (GUIDE_FLOWS.export ?? []).map(step => step.id)); }, [dataset.id, offer]);
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
    if (dataset.id === 'sentences900') void Promise.all(dataset.categories.flatMap(category => category.topics).map(async topic => {
      const states = await sqliteLearningStore.getTopicStates(topic);
      return (topic.scopeCardIds?.all ?? topic.cards.map(card => card.id)).filter(id => states[id]?.completed);
    })).then(groups => { if (!active) return; const counts: Record<string, number> = {}; for (const id of groups.flat()) { const scene = sentenceScenario(id); if (scene) counts[scene.id] = (counts[scene.id] ?? 0) + 1; } setSceneProgress(counts); }).catch(() => { if (active) setProgressError(true); });
    void loadCatalogProgress(dataset.categories.flatMap((category) => category.topics), scope).then((next) => {
      if (active) { setProgress(next); setProgressReady(true); }
    }).catch(() => { if (active) setProgressError(true); });
    return () => { active = false; };
  // Manual retry reloads progress while the catalog remains focused.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, scope, progressAttempt, account, scenePackage?.id]));

  function isLocked(topic: QuestionBankTopic) {
    return dataset.access?.membershipActive !== true
      && topic.access?.level === 'member'
      && topic.access.availableCardCount === 0;
  }

  const login = useLoginEntry();
  function openTopic(category: QuestionBankCategory, topic: QuestionBankTopic) {
    if (isLocked(topic)) {
      const next = `/question-bank/${dataset.id}/study/${category.id}/${topic.id}`;
      login(`/account/membership?next=${encodeURIComponent(next)}`, '登录后查看会员题库');
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

  if (scenePackage) return <Suspense fallback={<Screen><AppText>正在打开场景…</AppText></Screen>}><ScenarioStudyScreen studyPackage={scenePackage} onReturn={() => setScenePackage(undefined)} returnLabel="返回场景目录" returnHref="/question-bank/sentences900" /></Suspense>;
  if (exporting) return <SentenceExportScreen dataset={exportDataset ?? dataset} onBack={() => { if (guide?.current === 'export') guide.pause(); setExporting(false); }} />;
  return (
    <Screen background={<SoftGlow intensity={0.75} size={360} style={styles.glow} />} contentStyle={styles.screen}>
      <QuestionBankSwitcherHeader
        rightWidth={dataset.id === 'sentences900' ? 88 : 44}
        right={dataset.id === 'sentences900' ? <View style={styles.headerActions}>
          <Pressable style={styles.headerAction} accessibilityRole="button" accessibilityLabel="900句浏览方式" accessibilityHint={`当前按${sceneMode ? '场景' : '等级'}浏览`} accessibilityState={{ expanded: browseMenuVisible }} onPress={() => setBrowseMenuVisible(true)}><SlidersHorizontal size={21} color={colors.primary} /></Pressable>
          <Pressable style={styles.headerAction} accessibilityRole="button" accessibilityLabel="导出900句 PDF" onPress={() => { guide?.event('export-open'); setExporting(true); }}><GuideAnchor id="export-open" /><Download size={21} color={colors.primary}/></Pressable>
        </View> : undefined}
        items={switcherItems}
        onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
        onSelect={(nextBankId) => router.replace({ pathname: '/question-bank/[bankId]', params: { bankId: nextBankId } })}
        value={dataset.id}
      />
      <BottomSheet visible={browseMenuVisible} onClose={() => setBrowseMenuVisible(false)} accessibilityLabel="900句浏览方式">
        {([{ scene: false, title: '按等级' }, { scene: true, title: '按场景' }] as const).map(option => <Pressable key={option.title} accessibilityRole="radio" accessibilityState={{ checked: sceneMode === option.scene }} onPress={() => selectBrowseMode(option.scene)} style={styles.browseOption}>
          <AppText variant="button" style={{ flex: 1 }} color={sceneMode === option.scene ? colors.primary : colors.foreground}>{option.title}</AppText>
          {sceneMode === option.scene ? <Check size={18} color={colors.primary} /> : null}
        </Pressable>)}
      </BottomSheet>
      <View style={styles.scrollFrame}>
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {warning ? <View><AppText>暂时无法更新题库，正在显示本机已有目录，最新内容可能尚未包含。</AppText><Button variant="outline" onPress={onRetry}>重新加载题库</Button></View> : null}
          {progressError ? <View><AppText>学习进度暂时无法读取，记录未被清除。题目仍可学习。</AppText><Button variant="outline" onPress={() => setProgressAttempt(n => n + 1)}>重试读取进度</Button></View> : null}
          {sceneError ? <AppText color={colors.destructive}>{sceneError}</AppText> : null}
          {sceneMode && dataset.id === 'sentences900' ? SENTENCE_SCENARIOS.map(scene => {
            const count = sentenceScenarioCount(dataset, scene.id);
            return <Card key={scene.id}><Pressable accessibilityRole="button" disabled={sceneBusy || !count} onPress={() => void openScene(scene.id)} style={styles.categoryHeader}>
              <View style={styles.categoryIcon}><QuestionBankCategoryIcon bankId="sentences900" categoryId={`scenario-${scene.id}`} categoryName={scene.name} /></View>
              <View style={styles.categoryCopy}><AppText variant="cardTitle">{scene.name}</AppText><AppText variant="caption">{count} 句</AppText></View>
              <View style={styles.categoryStatus}><View style={styles.countPill}><AppText variant="micro" style={styles.countText} color={sceneProgress[scene.id] ? colors.primary : colors.mutedForeground}>{progressReady ? `${sceneProgress[scene.id] ?? 0}/${count}` : '进度待读取'}</AppText></View></View>
              <ChevronRight color={colors.mutedForeground} size={20} />
            </Pressable></Card>;
          }) : dataset.categories.map((category) => {
            const singleTopic = category.topics.length === 1 ? category.topics[0] : undefined;
            const isExpanded = !singleTopic && expanded === category.id;
            const categoryLearned = category.topics.reduce((sum, topic) => sum + (progress[topic.id]?.learned ?? 0), 0);
            const airline = dataset.id === 'radiotelephony' && hasAirlineMark(category.name);
            const singleLabel = singleTopic ? accessLabel(singleTopic) : undefined;
            return (
              <Card key={category.id} style={[styles.category, isExpanded ? styles.categoryExpanded : null]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${category.name}，${singleTopic ? '打开' : isExpanded ? '收起' : '展开'}`}
                  accessibilityState={singleTopic ? undefined : { expanded: isExpanded }}
                  onPress={() => singleTopic ? openTopic(category, singleTopic) : setExpanded(isExpanded ? undefined : category.id)}
                  style={({ pressed }) => [styles.categoryHeader, pressed ? styles.pressed : null]}
                >
                  <View testID={`catalog-icon-${category.id}`} style={[styles.categoryIcon, airline && styles.airlineIcon]}>
                    <QuestionBankCategoryIcon bankId={dataset.id} categoryId={category.id} categoryName={category.name} />
                  </View>
                  <View style={styles.categoryCopy}>
                    <AppText variant="cardTitle">{category.name}</AppText>
                    <AppText numberOfLines={1} variant="caption">
                      {singleTopic
                        ? `${category.declaredCardCount} ${dataset.cardUnit}`
                        : `${category.declaredTopicCount} ${category.topics.every((topic) => topic.practiceKind === 'scoring-points') ? '专项' : dataset.topicUnit} / ${category.declaredCardCount} ${dataset.cardUnit}`}
                    </AppText>
                  </View>
                  <View style={styles.categoryStatus}>
                    {singleLabel ? <View style={styles.accessPill}><AppText color={colors.primary} variant="micro">{singleLabel}</AppText></View> : null}
                    <View style={styles.countPill}>
                      {progressReady && categoryLearned >= category.declaredCardCount && category.declaredCardCount > 0 ? <Check color={colors.primary} size={12} /> : null}
                      <AppText color={categoryLearned ? colors.primary : colors.mutedForeground} style={styles.countText} variant="micro">
                        {progressReady ? `${categoryLearned}/${category.declaredCardCount}` : '进度待读取'}
                      </AppText>
                    </View>
                  </View>
                  {/* Rotate a stable layout view, never the SVG itself. Explicitly reset after collapse. */}
                  <View testID={`catalog-disclosure-${category.id}`} pointerEvents="none" style={[styles.disclosure, !singleTopic && isExpanded ? styles.rotated : styles.unrotated]}>
                    {singleTopic ? <ChevronRight color={colors.mutedForeground} size={20} /> : <ChevronDown color={colors.mutedForeground} size={20} />}
                  </View>
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
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  browseOption: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  screen: { paddingHorizontal: 0 },
  glow: { left: 8, top: -230 },
  scrollFrame: { flex: 1 },
  list: { gap: spacing[3], paddingBottom: 112, paddingHorizontal: spacing[5], paddingTop: spacing[3] },
  category: { padding: 0, ...shadows.card },
  categoryExpanded: { borderColor: colors.primary20 },
  categoryHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], minHeight: 74, padding: spacing[4] },
  categoryIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 40, justifyContent: 'center', width: 40 },
  airlineIcon: { borderRadius: radii.full },
  categoryCopy: { flex: 1, minWidth: 0 },
  categoryStatus: { alignItems: 'flex-end', gap: spacing[1], flexShrink: 0 },
  accessPill: { backgroundColor: colors.primary10, borderRadius: radii.full, paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  countPill: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.full, flexDirection: 'row', gap: 3, paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  countText: { fontFamily: fonts.monoRegular },
  disclosure: { height: 20, width: 20, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  rotated: { transform: [{ rotate: '180deg' }] },
  unrotated: { transform: [{ rotate: '0deg' }] },
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
