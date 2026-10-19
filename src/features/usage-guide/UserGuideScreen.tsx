import { useFocusEffect, useRouter } from 'expo-router';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BookMarked, Bot, ChevronRight, Flame, FolderOpen, Highlighter, Radio, Download, NotebookPen } from '@/components/ui/icons';
import { TopBar } from '@/components/navigation/TopBar';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { loadQuestionBank } from '@/features/question-bank/data/repository.native';
import type { QuestionBankDataset } from '@/features/question-bank/types';
import { AppText, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { colors, spacing } from '@/theme';
import { GUIDE_ENTRIES } from './guide-flows';
import { useGuide } from './GuideBindings';
import { readTutorialProgress } from './tutorial-progress';
import { TUTORIAL_STEPS, type TutorialProgress } from './tutorial-model';

const SentenceExportScreen = lazy(() => import('@/features/question-bank/export/SentenceExportScreen').then(module => ({ default: module.SentenceExportScreen })));

export const GUIDE_FEATURES = GUIDE_ENTRIES;
const GUIDE_ICONS = { study: Highlighter, vocab: BookMarked, radio: Radio, hotspot: Flame, resources: FolderOpen, 'mock-exam': Bot, recap: NotebookPen, export: Download };
export function UserGuideScreen() {
  const router = useRouter();
  const guide = useGuide();
  const auth = useAuth();
  const accountId = auth.account?.accountId ?? (auth.uiAcceptanceMode ? 'ui-acceptance' : undefined);
  const [saved, setSaved] = useState<{ accountId: string; progress: TutorialProgress }>();
  const [error, setError] = useState('');
  const [exportDataset, setExportDataset] = useState<{ accountId: string; dataset: QuestionBankDataset }>();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const exportGeneration = useRef(0);
  const exportOwner = useRef(accountId);
  exportOwner.current = accountId;
  useEffect(() => {
    exportGeneration.current += 1;
    setExportDataset(undefined); setExporting(false); setExportError('');
    return () => { exportGeneration.current += 1; };
  }, [accountId]);
  useFocusEffect(useCallback(() => {
    let active = true;
    setError('');
    if (accountId) void readTutorialProgress(accountId).then(progress => { if (active) setSaved({ accountId, progress }); }).catch(() => { if (active) setError('教程进度暂时无法读取，可以稍后重试；学习数据不受影响。'); });
    return () => { active = false; };
  }, [accountId]));
  const progress = saved && saved.accountId === accountId ? saved.progress : undefined;
  const complete = progress && progress.step >= TUTORIAL_STEPS.length;
  function start(restart = false) { router.push({ pathname: '/info/[slug]', params: { slug: 'tutorial', ...(restart ? { restart: '1' } : {}) } }); }
  async function openExport() {
    if (exporting || !accountId) return;
    const generation = ++exportGeneration.current;
    const isCurrent = () => exportGeneration.current === generation && exportOwner.current === accountId;
    setExporting(true); setExportError('');
    try {
      const result = await loadQuestionBank('sentences900');
      if (!result) throw new Error('bank_unavailable');
      if (isCurrent()) setExportDataset({ accountId, dataset: result.dataset });
    } catch { if (isCurrent()) setExportError('900句暂时无法读取，请联网后重试。'); }
    finally { if (isCurrent()) setExporting(false); }
  }
  if (exportDataset?.accountId === accountId && exportDataset) return <Suspense fallback={<GlobalLoadingScreen />}><SentenceExportScreen dataset={exportDataset.dataset} onBack={() => { setExportDataset(undefined); guide?.pause(); }} /></Suspense>;
  return <Screen scroll contentStyle={styles.screen}>
    <TopBar title="使用指南" />
    {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
    {GUIDE_ENTRIES.map(({ id, title, description }) => {
      const Icon = GUIDE_ICONS[id];
      return <Pressable accessibilityRole="button" accessibilityLabel={title} key={id} onPress={() => {
        if (id === 'study') start(Boolean(complete));
        else if (id === 'export') { void guide?.start(id); void openExport(); }
        else void guide?.start(id);
      }} onLongPress={() => { if (id === 'study') start(true); else { void guide?.start(id, true); if (id === 'export') void openExport(); } }} style={({ pressed }) => [styles.entry, pressed && { opacity: 0.7 }]}>
        <Icon color={colors.primary} size={21} /><View style={styles.copy}><AppText variant="cardTitle">{title}</AppText><AppText variant="caption">{description}</AppText></View><ChevronRight color={colors.mutedForeground} size={16} />
      </Pressable>;
    })}
    {exportError ? <AppText color={colors.destructive} variant="caption">{exportError}</AppText> : null}

  </Screen>;
}
const styles = StyleSheet.create({ screen: { paddingBottom: spacing[8] }, entry: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[4], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, copy: { flex: 1, gap: spacing[1] } });
