import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { normalizeStudyScope } from '@icao/contracts';
import { AppText, Card } from '@/components/ui';
import { Bookmark, ChevronRight, History, Star } from '@/components/ui/icons';
import { useAppRouter } from '@/components/navigation/useAppRouter';
import { useAuth } from '@/features/auth/AuthProvider';
import { examGoal } from '@/features/account/profile-model';
import { useProfile } from '@/features/account/profile-store.native';
import { nativeCommerceEnvironmentSnapshot, subscribeNativeCommerceEnvironment } from '@/features/native-commercial-testflight/commerce-environment';
import { useStudyCatalog } from '@/features/question-bank/hooks/useStudyCatalog.native';
import { loadStudyCatalogProgress, type StudyCatalogProgress } from '@/features/question-bank/lib/study-catalog-progress';
import { STUDY_SCOPE_OPTIONS } from '@/features/question-bank/lib/study-scope-options';
import { colors, fonts, spacing } from '@/theme';
import { StudyBankIcon } from './StudyBankIcon';
import { StudyPreferencesSheet } from './StudyPreferencesSheet.native';

const shortcuts = [
  { title: '学习记录', icon: History, route: '/learning-records' },
  { title: '我的标注', icon: Bookmark, route: '/annotations' },
  { title: '单词收藏', icon: Star, route: '/word-favorites' },
] as const;

export function ProfileLearningCard() {
  const router = useAppRouter();
  const profile = useProfile();
  const auth = useAuth();
  const accountId = auth.accountReady ? auth.account?.accountId : undefined;
  const environment = useSyncExternalStore(subscribeNativeCommerceEnvironment, nativeCommerceEnvironmentSnapshot, nativeCommerceEnvironmentSnapshot);
  const owner = `${accountId ?? ''}:${environment}`;
  const catalog = useStudyCatalog();
  const scope = normalizeStudyScope(profile.studyScope);
  const [preferencesAccount, setPreferencesAccount] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ owner: string; catalog: typeof catalog; progress?: StudyCatalogProgress; failed?: boolean }>();
  const mounted = useRef(true);
  useFocusEffect(useCallback(() => {
    mounted.current = true;
    return () => { mounted.current = false; setPreferencesAccount(undefined); };
  }, []));
  useFocusEffect(useCallback(() => {
    if (!accountId) return;
    let active = true, sequence = attempt;
    async function refresh() {
      const request = ++sequence;
      try {
        const progress = await loadStudyCatalogProgress(catalog, scope);
        if (active && sequence === request) setResult({ owner, catalog, progress });
      } catch { if (active && sequence === request) setResult({ owner, catalog, failed: true }); }
    }
    void refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { active = false; subscription.remove(); };
  }, [accountId, attempt, catalog, owner, scope]));
  const visibleResult = result?.owner === owner && result.catalog === catalog ? result : undefined;
  const goal = examGoal(profile.target);
  const scopeTitle = STUDY_SCOPE_OPTIONS.find(option => option.value === scope)?.title ?? '精选题库';
  // Keep all five section positions on one line; counts use two lines so real four-digit totals fit.
  return <>
    <Card style={styles.card} testID="profile-learning-card">
      <Pressable accessibilityRole="button" accessibilityLabel={`备考设置，${goal.label}，${scopeTitle}`} accessibilityHint="打开底部抽屉，修改目标等级、考试类型和题库范围" disabled={!accountId} onPress={() => setPreferencesAccount(accountId)} style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
        <View style={styles.summary}><AppText variant="button">{goal.label.replace(/ (初考|复考)$/u, ' · $1')}</AppText><View style={styles.divider} /><AppText variant="button">{scopeTitle}</AppText></View>
        <ChevronRight size={17} color={colors.mutedForeground} />
      </Pressable>
      <View style={styles.progress}>
        {catalog.map(bank => {
          const learned = visibleResult?.progress?.[bank.id];
          const percent = learned === undefined ? 0 : Math.min(1, learned / Math.max(1, bank.declaredCardCount));
          return <Pressable key={bank.id} accessibilityRole="button" accessibilityLabel={`${bank.title}，${learned === undefined ? '进度待读取' : `已练习 ${learned} 题`}，共 ${bank.declaredCardCount} 题`} accessibilityHint="进入对应题库" onPress={() => router.push({ pathname: '/question-bank/[bankId]', params: { bankId: bank.id } })} style={({ pressed }) => [styles.part, pressed && styles.pressed]}>
            <View style={styles.ring}>
              <Svg width={48} height={48} viewBox="0 0 48 48" style={StyleSheet.absoluteFill} aria-hidden={true}>
                <Circle cx={24} cy={24} r={22} stroke={colors.primary08} strokeWidth={3} fill="none" />
                {percent > 0 ? <Circle cx={24} cy={24} r={22} stroke={colors.primary} strokeWidth={3} fill="none" strokeDasharray={`${percent * 138.23} 138.23`} strokeLinecap="round" transform="rotate(-90 24 24)" /> : null}
              </Svg>
              <StudyBankIcon bankId={bank.id} />
            </View>
            <View style={styles.count}><AppText maxFontSizeMultiplier={1.3} style={styles.learned} variant="button">{learned ?? '—'}</AppText><AppText maxFontSizeMultiplier={1.3} style={styles.total} variant="caption">/ {bank.declaredCardCount}</AppText></View>
          </Pressable>;
        })}
      </View>
      <View style={styles.status}>{visibleResult?.failed ? <Pressable accessibilityRole="button" onPress={() => setAttempt(n => n + 1)}><AppText variant="caption" color={colors.primary}>进度读取失败，点击重试</AppText></Pressable> : null}</View>
      <View style={styles.shortcuts}>{shortcuts.map(item => <Pressable key={item.route} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => router.push(item.route)} style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}><item.icon size={21} color={colors.primary} /><AppText variant="caption" color={colors.foreground}>{item.title}</AppText></Pressable>)}</View>
    </Card>
    <StudyPreferencesSheet visible={!!accountId && preferencesAccount === accountId} accountId={accountId} profile={profile} onClose={() => { if (mounted.current) setPreferencesAccount(undefined); }} />
  </>;
}
const styles = StyleSheet.create({
  card: { padding: 0, marginTop: spacing[4], overflow: 'hidden' },
  result: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  summary: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[2] },
  divider: { width: 1, height: 16, backgroundColor: colors.border },
  progress: { height: 124, paddingHorizontal: spacing[2], paddingTop: spacing[3], flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' },
  part: { flexShrink: 1, minWidth: 44, alignItems: 'center', gap: spacing[2] },
  ring: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  count: { alignItems: 'center' }, learned: { fontFamily: fonts.monoRegular }, total: { fontFamily: fonts.monoRegular, fontSize: 11, lineHeight: 16 },
  status: { height: 24, alignItems: 'center', justifyContent: 'center' },
  shortcuts: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, flexDirection: 'row', paddingVertical: spacing[4] },
  shortcut: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: spacing[2] },
  pressed: { opacity: 0.72 },
});
