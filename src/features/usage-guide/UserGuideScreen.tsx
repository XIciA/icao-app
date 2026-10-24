import { useFocusEffect } from 'expo-router';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BookMarked, Bot, ChevronRight, Flame, FolderOpen, Highlighter, Radio, Download, NotebookPen, HelpCircle } from '@/components/ui/icons';
import { TopBar } from '@/components/navigation/TopBar';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { loadQuestionBank } from '@/features/question-bank/data/repository.native';
import type { QuestionBankDataset } from '@/features/question-bank/types';
import { AppText, Button, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { colors, spacing } from '@/theme';
import { GUIDE_ENTRIES } from './guide-flows';
import { useGuide } from './GuideBindings';

const SentenceExportScreen = lazy(() => import('@/features/question-bank/export/SentenceExportScreen').then(module => ({ default: module.SentenceExportScreen })));

export const GUIDE_FEATURES = GUIDE_ENTRIES;
const GUIDE_ICONS = { setup: HelpCircle, study: Highlighter, vocab: BookMarked, radio: Radio, hotspot: Flame, resources: FolderOpen, 'mock-exam': Bot, recap: NotebookPen, records: NotebookPen, export: Download };
export function UserGuideScreen() {
  const guide = useGuide();
  const auth = useAuth();
  const accountId = auth.account?.accountId ?? (auth.uiAcceptanceMode ? 'ui-acceptance' : undefined);
  const [exportDataset, setExportDataset] = useState<{ accountId: string; dataset: QuestionBankDataset }>();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const exportGeneration = useRef(0);
  useFocusEffect(useCallback(() => () => { exportGeneration.current += 1; setExporting(false); }, []));
  const exportOwner = useRef(accountId);
  exportOwner.current = accountId;
  useEffect(() => {
    exportGeneration.current += 1;
    setExportDataset(undefined); setExporting(false); setExportError('');
    return () => { exportGeneration.current += 1; };
  }, [accountId]);
  async function openExport() {
    if (exporting || !accountId) return;
    const generation = ++exportGeneration.current;
    const isCurrent = () => exportGeneration.current === generation && exportOwner.current === accountId;
    setExporting(true); setExportError('');
    try {
      const result = await loadQuestionBank('sentences900');
      if (!result) throw new Error('bank_unavailable');
      if (isCurrent()) { setExportDataset({ accountId, dataset: result.dataset }); void guide?.start('export'); }
    } catch { if (isCurrent()) setExportError('900句暂时无法读取，请联网后重试。'); }
    finally { if (isCurrent()) setExporting(false); }
  }
  if (exportDataset?.accountId === accountId && exportDataset) return <Suspense fallback={<GlobalLoadingScreen />}><SentenceExportScreen dataset={exportDataset.dataset} onBack={() => { setExportDataset(undefined); guide?.pause(); }} /></Suspense>;
  return <Screen scroll contentStyle={styles.screen} header={<TopBar title="使用指南" />}>
    {guide?.error ? <View><AppText color={colors.destructive} variant="caption">{guide.error}</AppText>{guide.ready === false ? <Button variant="ghost" onPress={guide.retry}>重试读取进度</Button> : null}</View> : null}
    {GUIDE_ENTRIES.map(({ id, title, description }) => {
      const Icon = GUIDE_ICONS[id];
      return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={guide?.ready === false} key={id} onLongPress={() => { if(id !== 'export') void guide?.start(id, true); }} onPress={() => {
        if (id === 'export') { void openExport(); }
        else void guide?.start(id);
      }} style={({ pressed }) => [styles.entry, pressed && { opacity: 0.7 }]}>
        <Icon color={colors.primary} size={21} /><View style={styles.copy}><AppText variant="cardTitle">{title}</AppText><AppText variant="caption">{description}</AppText></View><ChevronRight color={colors.mutedForeground} size={16} />
      </Pressable>;
    })}
    {exportError ? <AppText color={colors.destructive} variant="caption">{exportError}</AppText> : null}

  </Screen>;
}
const styles = StyleSheet.create({ screen: { paddingBottom: spacing[8] }, entry: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[4], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, copy: { flex: 1, gap: spacing[1] } });
